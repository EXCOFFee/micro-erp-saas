import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingEvent } from './entities/billing-event.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

/**
 * BillingModule — Gestión de suscripciones y webhooks de pago (SDD — SaaS Core).
 *
 * Responsabilidades:
 * - Recibir webhooks de MercadoPago (POST /billing/webhook/mercadopago)
 * - Validar firmas HMAC-SHA256 para prevenir falsificaciones
 * - Registrar pagos en billing_events (idempotencia)
 * - Actualizar el Tenant (status → ACTIVE, expires_at += 30 días)
 *
 * Importa Tenant para actualizar la suscripción al recibir un pago.
 * Exporta TypeORM para que otros módulos puedan consultar billing_events.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BillingEvent, Tenant])],
  controllers: [],   // Se agregará BillingController en Batch 2
  providers: [],     // Se agregará BillingService en Batch 2
  exports: [TypeOrmModule],
})
export class BillingModule {}
