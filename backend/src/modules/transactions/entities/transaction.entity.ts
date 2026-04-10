import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { TransactionType } from '../../../common/enums/transaction-type.enum';

/**
 * Entidad Transaction — Registro inmutable de movimientos financieros.
 *
 * PRINCIPIO FUNDAMENTAL (Regla de Oro V — Inmutabilidad):
 * Esta tabla es APPEND-ONLY (solo inserción). NUNCA se borran registros.
 * Si un cajero comete un error, se crea una nueva transacción de tipo
 * REVERSAL que anula el monto (CU-TX-03). El historial completo se
 * preserva para auditoría y transparencia.
 *
 * RESTRICCIÓN FINANCIERA (Regla de Oro III — Cero Floats):
 * `amount_cents` se almacena como INT (centavos).
 * Ejemplo: $15.000,50 = 1500050 centavos.
 *
 * IDEMPOTENCIA (Regla de Oro V — Zero Trust + Infra Free Tier):
 * `idempotency_key` es un UUID generado en el frontend ANTES de enviar
 * el POST. Si la red falla (o el Cold Start de Render causa un timeout
 * y el frontend reintenta), el backend detecta la clave duplicada y
 * retorna 200 OK sin crear una segunda transacción. Esto es la barrera
 * definitiva contra pagos/deudas duplicadas.
 *
 * NOTA: Esta entidad NO tiene UpdateDateColumn porque las transacciones
 * son inmutables una vez creadas. El campo `is_reversed` es la única
 * excepción: se marca como true cuando se crea una reversión.
 */
@Entity('transactions')
@Index(['tenant_id']) // Aislamiento multi-tenant
@Index(['tenant_id', 'idempotency_key'], { unique: true }) // Idempotencia por tenant
@Index(['tenant_id', 'customer_id']) // Historial de transacciones por cliente
@Index(['tenant_id', 'user_id', 'created_at']) // Arqueo de caja por cajero y fecha (CU-CAJ-01)
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── RELACIONES MULTI-TENANT ───────────────────────────────────────────

  /**
   * FK al comercio. Toda consulta DEBE filtrar por este campo.
   */
  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * FK al cliente/deudor afectado por esta transacción.
   */
  @Column({ type: 'uuid' })
  customer_id: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  /**
   * FK al usuario (cajero/admin) que registró esta operación.
   *
   * ADICIÓN AL DER ORIGINAL: Este campo no estaba en la spec original
   * pero es imprescindible para:
   * 1. Arqueo de caja por cajero (CU-CAJ-01): filtrar qué cobró cada empleado.
   * 2. Auditoría: saber QUIÉN registró cada movimiento financiero.
   * 3. Reportes de rendimiento de empleados.
   */
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ─── DATOS FINANCIEROS ─────────────────────────────────────────────────

  /**
   * Tipo de transacción (CU-TX-01 a CU-TX-05).
   * Determina cómo afecta al balance del cliente y si se suma al arqueo.
   * Ver documentación del enum TransactionType para reglas por tipo.
   */
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  /**
   * Monto de la transacción EN CENTAVOS (Regla de Oro III).
   * SIEMPRE positivo. La dirección del dinero la determina el `type`:
   * - DEBT/INFLATION_ADJUSTMENT: Suma al balance del cliente.
   * - PAYMENT/REVERSAL/FORGIVENESS: Resta del balance del cliente.
   */
  @Column({ type: 'int' })
  amount_cents: number;

  /**
   * Nota/descripción del cajero (ej: "Gaseosa, pan y fiambre").
   * Obligatorio en FORGIVENESS (CU-TX-04) como motivo de la condonación.
   * Opcional en otros tipos.
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ─── IDEMPOTENCIA Y SEGURIDAD ──────────────────────────────────────────

  /**
   * Clave de idempotencia (Regla de Oro V + Infra CU-SAAS).
   *
   * UUID generado en el FRONTEND antes del POST. Si el Cold Start de
   * Render causa timeout y el usuario reintenta, esta clave previene
   * la creación de transacciones duplicadas.
   *
   * Constraint: UNIQUE(tenant_id, idempotency_key) — dos tenants
   * distintos pueden generar el mismo UUID sin conflicto.
   */
  @Column({ type: 'uuid' })
  idempotency_key: string;

  // ─── REVERSIONES (CU-TX-03) ────────────────────────────────────────────

  /**
   * FK opcional a la transacción original que esta reversión anula.
   * Solo se usa cuando `type = REVERSAL`.
   * Permite trazar la cadena: Transacción Original ← Reversión.
   */
  @Column({ type: 'uuid', nullable: true })
  reversed_transaction_id: string | null;

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'reversed_transaction_id' })
  reversed_transaction: Transaction | null;

  /**
   * Flag que indica si esta transacción fue anulada por una REVERSAL posterior.
   * Útil para filtrar transacciones "vigentes" en reportes y dashboards
   * sin necesidad de JOINs complejos.
   */
  @Column({ type: 'boolean', default: false })
  is_reversed: boolean;

  // ─── MÓDULO DE CAJA (FUTURE FK) ────────────────────────────────────────

  /**
   * [FUTURE FOREIGN KEY — Módulo de Caja]
   *
   * ID del registro de cierre de caja al que pertenece esta transacción.
   * Cuando un cajero cierra su turno (CU-CAJ-02), el backend asocia
   * todas las transacciones PAYMENT del turno a este ID para "congelarlas"
   * y que no se vuelvan a sumar en el turno siguiente.
   *
   * NOTA TÉCNICA: La entidad CashRegisterLog se creará en una fase
   * posterior. Por ahora es una columna UUID nullable sin @ManyToOne
   * formal para evitar errores de compilación por entidad inexistente.
   * Cuando se construya el módulo de Caja, se agregará la relación.
   */
  @Column({ type: 'uuid', nullable: true })
  cash_register_log_id: string | null;

  // ─── TIMESTAMPS ────────────────────────────────────────────────────────

  /**
   * Fecha de creación de la transacción.
   * INMUTABLE: Una vez creada, no se modifica.
   * En modo offline (CU-OFFLINE-01), el backend respeta el `created_at`
   * del payload del frontend (generado en el momento real de la operación),
   * no la hora del servidor.
   */
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
