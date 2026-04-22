import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantStatus } from '../../../common/enums/tenant-status.enum';

/**
 * Entidad Tenant — Representa un comercio registrado en el SaaS.
 *
 * Cada comercio opera en un espacio de datos completamente aislado.
 * El `tenant_id` de esta entidad es la clave foránea que vincula TODAS
 * las demás tablas del sistema (Users, Customers, Transactions, AuditLogs).
 *
 * Regla de Negocio (CU-SAAS-01):
 * - El `tenant_name` PUEDE repetirse (puede haber dos "Kiosco Carlitos").
 * - El aislamiento se garantiza por UUID, no por nombre.
 *
 * Regla de Negocio (CU-SAAS-06):
 * - La columna `settings` (JSONB) almacena configuraciones regionales
 *   como símbolo de moneda, timezone, alias de MercadoPago y texto del ticket.
 *   Se usa JSONB en vez de columnas separadas para flexibilidad (KISS).
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Nombre comercial del negocio.
   * Puede repetirse entre tenants — el aislamiento es por UUID, no por nombre.
   */
  @Column({ type: 'varchar', length: 255 })
  tenant_name: string;

  /**
   * Plan de suscripción actual del comercio.
   * Valor por defecto 'FREE' para el onboarding inicial.
   */
  @Column({ type: 'varchar', length: 50, default: 'FREE' })
  subscription_plan: string;

  /**
   * Fecha de expiración de la suscripción.
   * Un Cron Job diario (CU-SAAS-04) compara esta fecha contra HOY:
   * si expiró, el status pasa a SUSPENDED y el comercio no puede operar.
   */
  @Column({ type: 'timestamptz', nullable: true })
  subscription_expires_at: Date | null;

  /**
   * Estado del tenant en el ciclo de vida SaaS.
   * - TRIAL: 14 días gratis post-onboarding (default).
   * - ACTIVE: Suscripción al día.
   * - PAST_DUE: Vencida, 3 días de gracia (banner rojo).
   * - SUSPENDED: Hard lock (403/402 en endpoints operativos).
   * - CANCELLED: Baja definitiva.
   */
  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status: TenantStatus;

  /**
   * ID de suscripción de MercadoPago (SDD — SaaS Core).
   *
   * Se asigna cuando el comercio vincula su cuenta de MercadoPago
   * con el sistema de billing. El BillingService lo usa para
   * identificar qué tenant corresponde a un webhook de pago.
   *
   * NULL si el comercio aún no vinculó MercadoPago (ej: en TRIAL).
   */
  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  mp_subscription_id: string | null;

  /**
   * Configuraciones regionales y de personalización del comercio (CU-SAAS-06).
   *
   * Estructura esperada (flexible, sin schema rígido):
   * {
   *   currency_symbol: "$" | "Gs" | "COP",
   *   timezone: "America/Argentina/Buenos_Aires",
   *   ticket_header: "KIOSCO CARLITOS - CUIT 20-12345678-9",
   *   payment_alias: "alias.mercadopago" (CU-NOTIF-02),
   *   enabled_payment_methods: ["CASH", "TRANSFER"],
   *   default_credit_limit_cents: 5000000,
   *   auto_block_overdue_days: 3
   * }
   *
   * Se usa JSONB de PostgreSQL para evitar crear tablas adicionales
   * y permitir agregar nuevas preferencias sin migraciones.
   */
  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  /**
   * FK al turno de caja actualmente abierto (spec_expansion_v2 — Fase 1).
   *
   * NULL = No hay turno abierto → se puede abrir uno nuevo.
   * NOT NULL = Hay un turno en curso → se bloquea la apertura de otro.
   *
   * Este campo se usa como "semáforo" con Pessimistic Lock sobre la fila
   * del Tenant para impedir que dos cajeros abran caja simultáneamente
   * en un comercio de un solo mostrador.
   *
   * Ciclo de vida:
   * - POST /cash-register/open  → SET active_cash_shift_id = new shift ID
   * - POST /cash-register/close → SET active_cash_shift_id = NULL
   */
  @Column({ type: 'uuid', nullable: true, default: null })
  active_cash_shift_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
