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
 * Entidad CashRegisterLog — Registro de cierres de caja (CU-CAJ-01/02).
 *
 * Cada fila representa un turno cerrado por un cajero.
 * Al cerrar, el backend calcula cuánto DEBERÍA haber en caja
 * (sumando PAYMENTs del turno), el cajero informa cuánto HAY REALMENTE,
 * y el sistema registra la diferencia (faltante/sobrante).
 *
 * Las transacciones PAYMENT de ese turno quedan "congeladas" al asociar
 * su `cash_register_log_id` a este cierre (CU-CAJ-02 Directiva Técnica).
 *
 * Regla Multi-Tenant (Regla de Oro II):
 * Toda query filtra por tenant_id.
 */
@Entity('cash_register_logs')
@Index(['tenant_id'])
@Index(['tenant_id', 'user_id'])
export class CashRegisterLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * Cajero que realizó el cierre de turno
   */
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Inicio del turno: timestamp del último cierre de este cajero
   * o la fecha de creación del usuario si nunca cerró.
   */
  @Column({ type: 'timestamptz' })
  opened_at: Date;

  /** Momento exacto del cierre de turno */
  @Column({ type: 'timestamptz' })
  closed_at: Date;

  /**
   * Fondo inicial en gaveta al abrir el turno, EN CENTAVOS (Regla de Oro III).
   * Ejemplo: $3.000 fondo = 300000 centavos.
   * Nullable/default 0 para compatibilidad con cierres registrados antes de este campo.
   */
  @Column({ type: 'int', default: 0, nullable: true })
  opening_cash_cents: number;

  /**
   * Lo que el sistema dice que cobró el cajero, EN CENTAVOS (Regla de Oro III).
   * Calculado como SUM(amount_cents) de PAYMENTs del turno.
   */
  @Column({ type: 'int' })
  expected_cash_cents: number;

  /**
   * Lo que el cajero reporta que tiene, EN CENTAVOS.
   * Ingresado manualmente por el cajero al cerrar turno.
   */
  @Column({ type: 'int' })
  actual_cash_cents: number;

  /**
   * Diferencia = actual - expected.
   * Positivo = sobrante, Negativo = faltante.
   */
  @Column({ type: 'int' })
  discrepancy_cents: number;

  /**
   * Nota obligatoria si hay descuadre (CU-CAJ-02).
   * Ej: "Tuve que pagarle al sodero", "Me sobraron $500".
   */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /**
   * Estado del cierre (CU-CAJ-02).
   * CLOSED_OK si cuadra, CLOSED_WITH_DISCREPANCY si no.
   */
  @Column({
    type: 'enum',
    enum: CashRegisterStatus,
  })
  status: CashRegisterStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
