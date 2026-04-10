import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TransactionType } from '../../common/enums/transaction-type.enum';

/**
 * Payload del JWT de solo lectura para resúmenes públicos (CU-NOTIF-01).
 *
 * Este JWT NO es el mismo que el de autenticación:
 * - No contiene role ni token_version
 * - Tiene un campo `type: 'summary'` para diferenciarlo
 * - Expira en 72h (el link caduca por seguridad)
 */
interface SummaryTokenPayload {
  tenant_id: string;
  customer_id: string;
  type: 'summary';
}

/**
 * Resultado tipado del resumen público de deuda.
 * Esta es la info que lee el moroso cuando abre el link de WhatsApp.
 */
export interface PublicDebtSummary {
  /** Nombre del comercio */
  business_name: string;
  /** Nombre del cliente */
  customer_name: string;
  /** Saldo actual en centavos */
  balance_cents: number;
  /** Últimas 5 transacciones tipo DEBT (lo que llevó) */
  recent_debts: Array<{
    amount_cents: number;
    description: string | null;
    created_at: Date;
  }>;
  /** Últimos 2 pagos registrados */
  recent_payments: Array<{
    amount_cents: number;
    created_at: Date;
  }>;
  /** Alias de MercadoPago/CVU del comercio (CU-NOTIF-02), null si no configurado */
  payment_alias: string | null;
}

/**
 * NotificationsService — Resúmenes compartibles por WhatsApp (CU-NOTIF-01/02).
 *
 * Flujo (CU-NOTIF-01):
 * 1. Cajero hace clic en "Compartir Deuda" → POST /notifications/summary-link/:id
 * 2. Backend genera un JWT de solo lectura con tenant_id + customer_id
 * 3. Retorna un magic link: /public/summary/{token}
 * 4. El moroso abre el link → GET /public/summary/:token (@Public)
 * 5. Backend decodifica el JWT, busca la data, retorna el resumen
 *
 * Seguridad (CU-NOTIF-01 Directiva):
 * - No se usan IDs incrementales en la URL
 * - El JWT firmado es el único mecanismo de acceso
 * - El JWT expira en 72h
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Genera un magic link con JWT de solo lectura (CU-NOTIF-01).
   *
   * El JWT contiene solo tenant_id, customer_id y type='summary'.
   * No tiene permisos de escritura ni roles.
   */
  async generateSummaryLink(
    tenantId: string,
    customerId: string,
  ): Promise<{ link: string; token: string; expires_in: string }> {
    // Verificar que el cliente existe y pertenece al tenant
    const customer = await this.dataSource.getRepository(Customer).findOne({
      where: { id: customerId, tenant_id: tenantId },
      select: ['id'],
    });

    if (!customer) {
      throw new Error('Cliente no encontrado');
    }

    const payload: SummaryTokenPayload = {
      tenant_id: tenantId,
      customer_id: customerId,
      type: 'summary',
    };

    // JWT de solo lectura con expiración de 72h
    const token = this.jwtService.sign(payload, { expiresIn: '72h' });

    return {
      link: `/public/summary/${token}`,
      token,
      expires_in: '72 horas',
    };
  }

  /**
   * Decodifica un token público y retorna el resumen de deuda (CU-NOTIF-01).
   *
   * Endpoint @Public (sin autenticación) — cualquiera con el link puede verlo.
   * El JWT firmado es la única barrera de acceso.
   *
   * Incluye el payment_alias del tenant (CU-NOTIF-02) si está configurado.
   */
  async getPublicSummary(token: string): Promise<PublicDebtSummary> {
    // Decodificar el JWT (lanza error si expirado o inválido)
    let payload: SummaryTokenPayload;
    try {
      payload = this.jwtService.verify<SummaryTokenPayload>(token);
    } catch {
      throw new Error('Enlace inválido o expirado');
    }

    if (payload.type !== 'summary') {
      throw new Error('Token inválido');
    }

    const { tenant_id, customer_id } = payload;

    // Buscar tenant, cliente y transacciones en paralelo
    const [tenant, customer, recentDebts, recentPayments] = await Promise.all([
      // Nombre del comercio + payment_alias
      this.dataSource.getRepository(Tenant).findOne({
        where: { id: tenant_id },
        select: ['tenant_name', 'settings'],
      }),

      // Nombre y saldo del cliente
      this.dataSource.getRepository(Customer).findOne({
        where: { id: customer_id, tenant_id },
        select: ['full_name', 'balance_cents'],
      }),

      // Últimas 5 deudas (lo que se llevó)
      this.dataSource.getRepository(Transaction).find({
        where: {
          customer_id,
          tenant_id,
          type: TransactionType.DEBT,
          is_reversed: false,
        },
        select: ['amount_cents', 'description', 'created_at'],
        order: { created_at: 'DESC' },
        take: 5,
      }),

      // Últimos 2 pagos
      this.dataSource.getRepository(Transaction).find({
        where: {
          customer_id,
          tenant_id,
          type: TransactionType.PAYMENT,
          is_reversed: false,
        },
        select: ['amount_cents', 'created_at'],
        order: { created_at: 'DESC' },
        take: 2,
      }),
    ]);

    if (!tenant || !customer) {
      throw new Error('Datos no encontrados');
    }

    // Extraer payment_alias del JSONB settings (CU-NOTIF-02)
    const settings = tenant.settings;
    const paymentAlias =
      typeof settings?.payment_alias === 'string'
        ? settings.payment_alias
        : null;

    return {
      business_name: tenant.tenant_name,
      customer_name: customer.full_name,
      balance_cents: customer.balance_cents,
      recent_debts: recentDebts,
      recent_payments: recentPayments,
      payment_alias: paymentAlias,
    };
  }
}
