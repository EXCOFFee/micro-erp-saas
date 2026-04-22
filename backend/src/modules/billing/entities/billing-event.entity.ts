import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Entidad BillingEvent — Registro idempotente de pagos de suscripción (SDD — SaaS Core).
 *
 * Cada vez que MercadoPago envía un webhook de pago exitoso, el BillingService
 * intenta insertar un BillingEvent con el `external_payment_id` del pago.
 * Si el ID ya existe (UNIQUE constraint), el webhook es un reintento
 * y se responde 200 OK sin re-procesar.
 *
 * Esto es CRÍTICO para el patrón Hybrid de reintentos:
 * Render Free Tier puede hibernar → MercadoPago reintenta → el servidor
 * despierta y recibe múltiples reintentos atrasados → solo se procesa el primero.
 *
 * Regla estricta: JAMÁS borrar registros de billing_events (auditoría financiera).
 */
@Entity('billing_events')
@Index(['tenant_id'])
export class BillingEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID externo del pago en la pasarela (MercadoPago payment ID).
   * UNIQUE: garantiza idempotencia a nivel de BD.
   * Si MercadoPago envía el mismo pago 5 veces, solo el primero se inserta.
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  external_payment_id: string;

  /**
   * Tenant al que corresponde este pago.
   * Se resuelve via `mp_subscription_id` del Tenant.
   */
  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * Proveedor de pago. Fijo 'mercadopago' por ahora.
   * Campo extensible para futura integración con otras pasarelas.
   */
  @Column({ type: 'varchar', length: 50 })
  provider: string;

  /**
   * Monto del pago en centavos (Regla de Oro III — Cero Floats).
   * Ej: $30 USD = 3000 centavos.
   */
  @Column({ type: 'int' })
  amount_cents: number;

  /**
   * Moneda del pago (ISO 4217).
   * Ej: 'ARS', 'USD'.
   */
  @Column({ type: 'varchar', length: 10 })
  currency: string;

  /**
   * Payload crudo del webhook almacenado para auditoría forense.
   * Si hay una disputa con MercadoPago, este JSON es la evidencia.
   */
  @Column({ type: 'jsonb', default: {} })
  raw_payload: Record<string, unknown>;

  /**
   * Momento en que se procesó el webhook.
   */
  @CreateDateColumn({ type: 'timestamptz' })
  processed_at: Date;
}
