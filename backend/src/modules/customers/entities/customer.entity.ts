import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Entidad Customer — Representa a un cliente/deudor de un comercio.
 *
 * RESTRICCIÓN FINANCIERA CRÍTICA (Regla de Oro III — Cero Floats):
 * Los campos `credit_limit_cents` y `balance_cents` se almacenan como
 * ENTEROS (centavos). Ejemplo: $150.50 se guarda como 15050.
 * Esto elimina errores de redondeo de punto flotante que son inaceptables
 * en un sistema financiero. La conversión a formato "humano" ($150,50)
 * se hace EXCLUSIVAMENTE en el frontend/serialización.
 *
 * Regla de Negocio Multi-Tenant (Regla de Oro II):
 * Un Customer pertenece a exactamente UN Tenant. Dos tenants pueden tener
 * un cliente con el mismo nombre. La unicidad de teléfono y DNI es
 * POR TENANT (índice parcial compuesto), no global.
 */
@Entity('customers')
@Index(['tenant_id']) // Aislamiento multi-tenant en todas las queries
@Index(['tenant_id', 'balance_cents']) // Performance: Dashboard de morosos (CU-DASH-01)
@Index(['tenant_id', 'is_overdue']) // Performance: Cron Job busca morosos por tenant (HU6)
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * FK al comercio dueño de esta relación comercial.
   * Regla de Oro II: TODA consulta a esta tabla DEBE incluir tenant_id.
   */
  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * Nombre completo o apodo del cliente.
   * Los comercios barriales suelen registrar clientes informalmente
   * (ej: "el Gordo de la esquina"), por lo que no se exige formato estricto.
   */
  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  /**
   * Teléfono del cliente (opcional).
   * Unicidad: UNIQUE dentro del mismo tenant (índice parcial).
   * Puede ser NULL si el cliente no tiene teléfono registrado.
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  /**
   * DNI/Cédula del cliente (opcional).
   * Unicidad: UNIQUE dentro del mismo tenant (índice parcial).
   * En la informalidad del rubro, muchos clientes no tienen DNI registrado.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  dni: string | null;

  /**
   * Límite de crédito máximo permitido, EN CENTAVOS (Regla de Oro III).
   * Ejemplo: $50.000 = 5000000 centavos.
   *
   * Regla de Negocio (CU-CLI-02):
   * - Solo el ADMIN puede modificar este valor.
   * - Si se baja a un valor menor que la deuda actual, el cliente queda
   *   en estado "Excedido" pero su deuda histórica se mantiene intacta.
   */
  @Column({ type: 'int', default: 0 })
  credit_limit_cents: number;

  /**
   * Saldo de deuda actual del cliente, EN CENTAVOS (Regla de Oro III).
   * Valor positivo = el cliente DEBE dinero al comercio.
   *
   * IMPORTANTE: Este campo NUNCA debe ser enviado por el frontend en un
   * payload de creación (CU-CLI-01). El valor inicial es estrictamente 0.
   * Solo se modifica a través de transacciones (DEBT, PAYMENT, REVERSAL, etc.)
   * con Pessimistic Lock para evitar race conditions.
   */
  @Column({ type: 'int', default: 0 })
  balance_cents: number;

  /**
   * Flag de activación del cliente (CU-CLI-03 — Lista Negra).
   *
   * Cuando is_active = false:
   * - NO puede registrar nuevas deudas (403 Forbidden).
   * - SÍ puede registrar pagos (queremos recuperar la plata).
   * - Sigue visible en el dashboard de morosos (no es soft-delete).
   */
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  /**
   * Fecha de la próxima promesa de pago del cliente (CU-CLI-05).
   * Ejemplo: "El viernes cuando cobre te pago".
   *
   * En el Dashboard (CU-DASH-01), los clientes con fecha = HOY o VENCIDA
   * se resaltan en rojo para facilitar el seguimiento de cobranza.
   * Permite NULL si no hay promesa registrada.
   */
  @Column({ type: 'date', nullable: true })
  next_payment_promise: Date | null;

  /**
   * Flag de mora — indica si el Cron Job detectó que el cliente
   * superó su fecha de promesa de pago con deuda pendiente (HU6).
   *
   * Ciclo de vida:
   * - Se setea a `true` cuando el OverdueCronService corre y encuentra
   *   que next_payment_promise < NOW() y balance_cents > 0.
   * - Se setea a `false` automáticamente cuando el cliente paga su deuda
   *   (balance_cents llega a 0 en TransactionsService).
   *
   * El CustomerAuditSubscriber captura el cambio de este flag y genera
   * un audit log de tipo AuditAction.MARK_OVERDUE.
   *
   * No confundir con is_active (bloqueo manual por el admin).
   * Un cliente moroso (is_overdue=true) puede seguir haciendo pagos,
   * pero NO puede registrar nuevas deudas (misma regla que is_active=false).
   */
  @Column({ type: 'boolean', default: false })
  is_overdue: boolean;

  /**
   * Flag de auto-bloqueo por exceso de límite de crédito (spec_expansion_v2 — Fase 2).
   *
   * Cuando auto_block_on_limit = true:
   * El OverdueCronService verifica si balance_cents >= credit_limit_cents.
   * Si se cumple, el sistema pasa is_active = false automáticamente,
   * bloqueando nuevos fiados sin intervención manual del Admin.
   *
   * Cuando auto_block_on_limit = false (default):
   * El bloqueo por exceso de límite es solo preventivo (403 en registerDebt),
   * pero el cliente NO se desactiva automáticamente.
   *
   * NOTA: Este flag es por CLIENTE, no por Tenant. Un Admin puede activarlo
   * selectivamente para clientes "riesgosos" sin afectar a los VIP.
   */
  @Column({ type: 'boolean', default: false })
  auto_block_on_limit: boolean;

  /**
   * Dirección del cliente (opcional).
   * Útil para comercios con entrega a domicilio o cobranza en persona.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  address: string | null;

  /**
   * Email del cliente (opcional).
   * Usado para el envío de resúmenes de cuenta mensuales (HU-EXP-08 // Fase 5).
   * UNIQUE por tenant — validado en el service, no por índice de BD para
   * permitir NULL múltiple (comportamiento estándar de PostgreSQL).
   */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  email: string | null;

  /**
   * Nota interna del comercio sobre el cliente.
   * Uso típico: "Cobrar los martes", "No fiar más de $5000", "Tiene heladera vieja".
   * Solo visible para el comercio, nunca expuesta al cliente final.
   */
  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  /**
   * Etiquetas (tags) para clasificación interna del cliente.
   * Ejemplos: ["VIP", "moroso", "delivery"].
   * Almacenado como array de text en PostgreSQL.
   */
  @Column({ type: 'text', array: true, nullable: true, default: null })
  tags: string[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
