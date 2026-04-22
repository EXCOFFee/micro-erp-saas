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
import { User } from '../../users/entities/user.entity';
import { CashRegisterStatus } from '../../../common/enums/cash-register-status.enum';

/**
 * Entidad CashRegisterLog — Registro de turnos de caja (CU-CAJ-01/02).
 *
 * MODELO DE TURNOS EXPLÍCITOS (spec_expansion_v2 — Fase 1):
 * A diferencia del modelo anterior (turnos implícitos calculados desde
 * el último cierre), ahora cada turno tiene un ciclo de vida explícito:
 *
 *   OPEN → CLOSED_OK | CLOSED_WITH_DISCREPANCY
 *
 * Flujo:
 * 1. El cajero llama POST /cash-register/open → se crea un registro OPEN
 *    con opening_cash_cents y se bloquea la apertura de otro turno
 *    (via Tenant.active_cash_shift_id + Pessimistic Lock).
 * 2. Durante el turno, las transacciones PAYMENT se asocian a este turno.
 * 3. Al cerrar POST /cash-register/close → se calcula expected_cash,
 *    se registra actual_cash y discrepancy, y se pasa a CLOSED_*.
 *
 * RESTRICCIÓN DE SIMULTANEIDAD:
 * Solo UN turno OPEN a la vez por tenant (un solo mostrador).
 * Controlado por Tenant.active_cash_shift_id (Pessimistic Lock sobre Tenant).
 *
 * Regla Multi-Tenant (Regla de Oro II):
 * Toda query filtra por tenant_id.
 */
@Entity('cash_register_logs')
@Index(['tenant_id'])
@Index(['tenant_id', 'user_id'])
@Index(['tenant_id', 'status']) // Para buscar turno OPEN rápidamente
export class CashRegisterLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * Cajero que abrió/cerró el turno.
   */
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Momento exacto de apertura del turno.
   * Se registra al crear el turno (POST /cash-register/open).
   */
  @Column({ type: 'timestamptz' })
  opened_at: Date;

  /**
   * Momento exacto del cierre de turno.
   * NULL mientras el turno está OPEN.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  closed_at: Date | null;

  /**
   * Fondo inicial en gaveta al abrir el turno, EN CENTAVOS (Regla de Oro III).
   * Ejemplo: $3.000 fondo = 300000 centavos.
   * Registrado al abrir turno. Inmutable después.
   */
  @Column({ type: 'int', default: 0 })
  opening_cash_cents: number;

  /**
   * Lo que el sistema calcula que DEBERÍA haber en caja, EN CENTAVOS.
   * Fórmula: opening_cash_cents + SUM(amount_cents WHERE payment_method = 'CASH').
   *
   * NULL mientras el turno está OPEN (se calcula al cerrar).
   */
  @Column({ type: 'int', nullable: true, default: null })
  expected_cash_cents: number | null;

  /**
   * Lo que el cajero reporta que tiene, EN CENTAVOS.
   * Ingresado manualmente por el cajero al cerrar turno.
   *
   * NULL mientras el turno está OPEN.
   */
  @Column({ type: 'int', nullable: true, default: null })
  actual_cash_cents: number | null;

  /**
   * Diferencia = actual - expected.
   * Positivo = sobrante, Negativo = faltante.
   *
   * NULL mientras el turno está OPEN.
   */
  @Column({ type: 'int', nullable: true, default: null })
  discrepancy_cents: number | null;

  /**
   * Nota obligatoria si hay descuadre (CU-CAJ-02).
   * Ej: "Tuve que pagarle al sodero", "Me sobraron $500".
   */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /**
   * Estado del turno (CU-CAJ-02).
   * OPEN: Turno en curso — el cajero está trabajando.
   * CLOSED_OK: Cerrado sin descuadre.
   * CLOSED_WITH_DISCREPANCY: Cerrado con faltante/sobrante.
   */
  @Column({
    type: 'enum',
    enum: CashRegisterStatus,
    default: CashRegisterStatus.OPEN,
  })
  status: CashRegisterStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
