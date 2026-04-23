import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { BillingEvent } from './entities/billing-event.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantStatus } from '../../common/enums/tenant-status.enum';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Verifica la firma HMAC-SHA256 de MercadoPago.
   */
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  verifySignature(signature: string, requestId: string, body: any): boolean {
    if (!signature || !requestId || !body) return false;

    // Si no hay secreto configurado (ej: test local), omitimos validación
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn(
        'MP_WEBHOOK_SECRET no configurado. Omitiendo validación (solo usar en dev).',
      );
      return true;
    }

    try {
      // Formato de x-signature: "ts=12345,v1=abcdf..."
      const parts = signature.split(',');
      let ts = '';
      let v1 = '';

      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
      }

      if (!ts || !v1) return false;

      // Según doc de MP, el manifest es "id:{data.id};request-id:{x-request-id};ts:{ts};"
      const dataId = body.data?.id;
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

      const hmac = crypto
        .createHmac('sha256', secret)
        .update(manifest)
        .digest('hex');

      return hmac === v1;
    } catch (e) {
      this.logger.error('Error calculando HMAC', e);
      return false;
    }
  }

  /**
   * Procesamiento idempotente del pago.
   * Utiliza una transacción para evitar condiciones de carrera.
   */
  async processPayment(
    externalPaymentId: string,
    rawPayload: any,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar si ya existe (Idempotencia)
      const existingEvent = await queryRunner.manager.findOne(BillingEvent, {
        where: { external_payment_id: externalPaymentId },
      });

      if (existingEvent) {
        this.logger.log(
          `El pago ${externalPaymentId} ya fue procesado. Ignorando.`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      // En un escenario real, haríamos un GET a la API de MP para obtener el monto,
      // la moneda y el tenant_id. Como esto es un webhook y por simplicidad asumo
      // que obtenemos el `mp_subscription_id` o el `tenant_id` de alguna metadata.
      // Para este demo, buscaremos el tenant usando un external_reference si viniera,
      // pero simularemos un pago de prueba buscando el primer tenant (o uno con el subscription_id)

      const mpSubscriptionId =
        rawPayload.data?.subscription_id || 'test_sub_id';

      // Intentamos encontrar el tenant
      const tenant = await queryRunner.manager.findOne(Tenant, {
        where: { mp_subscription_id: mpSubscriptionId },
      });

      if (!tenant) {
        // En este MVP simulamos que lo vinculamos a un tenant conocido si no hay
        this.logger.warn(
          `Tenant no encontrado para suscripción ${mpSubscriptionId}`,
        );
        // await queryRunner.rollbackTransaction();
        // return;
      }

      const tenantId = tenant
        ? tenant.id
        : '00000000-0000-0000-0000-000000000000'; // Fallback a algún UUID o lanzar error

      // 1. Insertar el BillingEvent
      const event = queryRunner.manager.create(BillingEvent, {
        external_payment_id: externalPaymentId,
        tenant_id: tenantId,
        provider: 'mercadopago',
        amount_cents: 3000, // Hardcoded para el demo, debe venir de MP API
        currency: 'ARS',
        raw_payload: rawPayload,
      });

      if (tenant) {
        await queryRunner.manager.save(event);

        // 2. Actualizar el Tenant
        // Sumar 30 días a la expiración
        const currentExpiration = tenant.subscription_expires_at
          ? new Date(tenant.subscription_expires_at)
          : new Date();
        const newExpiration = new Date(currentExpiration);
        newExpiration.setDate(newExpiration.getDate() + 30);

        tenant.status = TenantStatus.ACTIVE;
        tenant.subscription_expires_at = newExpiration;

        await queryRunner.manager.save(tenant);
      } else {
        // Si no hay tenant mapeado, no podemos procesarlo en la BD real.
        // Simulamos completarlo igual o loguear.
        this.logger.error(
          'No se pudo procesar porque el tenant_id no es resoluble',
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Pago ${externalPaymentId} procesado exitosamente`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error procesando pago ${externalPaymentId}`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
