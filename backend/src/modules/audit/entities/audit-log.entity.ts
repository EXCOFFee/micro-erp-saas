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
import { AuditAction } from '../../../common/enums/audit-action.enum';

/**
 * Entidad AuditLog — Registro inmutable de acciones sensibles (CU-AUDIT-01 / HU5).
 *
 * Propósito: Dejar un rastro forense cuando un usuario modifica datos
 * críticos (límites de crédito, bloqueos, condonaciones). Permite detectar
 * fraudes internos: ej. un cajero que sube el límite de crédito de un cómplice.
 *
 * ── CAMBIO spec_part_2.md vs versión anterior ────────────────────────────────
 * Antes: `action` era un VARCHAR libre → riesgo de typos, búsquedas inconsistentes.
 * Ahora: `action` es un ENUM de PostgreSQL respaldado por `AuditAction`.
 * Esto garantiza que solo se puedan escribir valores del catálogo definido
 * y permite queries tipadas: WHERE action = 'UPDATE_CREDIT_LIMIT'.
 *
 * ── PRINCIPIO DE INMUTABILIDAD ───────────────────────────────────────────────
 * Esta tabla es APPEND-ONLY. Los registros NUNCA se modifican ni borran.
 * No tiene UpdateDateColumn ni lógica de soft-delete.
 *
 * ── JSONB para old_value / new_value ─────────────────────────────────────────
 * Se usa `jsonb` (no `json`) para que PostgreSQL indexe internamente el contenido,
 * habilitando búsquedas futuras como:
 *   SELECT * FROM audit_logs WHERE old_value->>'credit_limit_cents' = '5000000';
 * Algo imposible con JSON plano.
 *
 * ── Regla Multi-Tenant (Regla de Oro II) ─────────────────────────────────────
 * Cada registro pertenece a un tenant. El Admin solo ve los logs de su comercio.
 * TODA query debe filtrar por `tenant_id`.
 */
@Entity('audit_logs')
@Index(['tenant_id', 'created_at']) // Búsquedas de auditoría por rango horario
@Index(['tenant_id', 'action']) // Filtrar por tipo de acción por tenant
@Index(['entity_id']) // Localizar el historial de un registro específico
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── CONTEXTO MULTI-TENANT ─────────────────────────────────────────────────

  /**
   * FK al comercio donde ocurrió la acción.
   * Fuente de verdad: proviene del JWT del usuario, NUNCA del payload del request.
   */
  @Column({ type: 'uuid' })
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /**
   * FK al usuario que ejecutó la acción auditada. Responde: "¿QUIÉN lo hizo?"
   *
   * Nullable porque las acciones automáticas del sistema (Cron de mora,
   * Subscribers automáticos) no tienen un usuario humano asociado.
   * En esos casos, se inserta null para mantener la integridad referencial.
   */
  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  // ─── DATOS DE LA ACCIÓN ───────────────────────────────────────────────────

  /**
   * Tipo de acción ejecutada — Enum nativo de PostgreSQL (HU5 spec_part_2.md).
   *
   * Por qué ENUM en vez de VARCHAR:
   * 1. Integridad: PostgreSQL rechaza a nivel de BD cualquier valor fuera del catálogo.
   * 2. Performance: Los ENUM ocupan 4 bytes vs cadena variable.
   * 3. Tipado: TypeScript detecta usos incorrectos en compile-time.
   * 4. Mantenibilidad: El catálogo de acciones auditables está centralizado
   *    en src/common/enums/audit-action.enum.ts.
   */
  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  /**
   * Tipo de entidad afectada (nombre de la clase TypeORM).
   * Ejemplos: 'Customer', 'Transaction', 'User'.
   * Junto con entity_id permite localizar exactamente qué registro fue alterado.
   */
  @Column({ type: 'varchar', length: 100 })
  entity_type: string;

  /**
   * UUID de la entidad específica que fue modificada.
   * Indexado para recuperar el historial completo de un cliente,
   * transacción o usuario con una query eficiente (evitar full-scan).
   */
  @Column({ type: 'uuid' })
  entity_id: string;

  /**
   * Snapshot del estado ANTERIOR a la modificación (JSONB en PostgreSQL).
   *
   * Ejemplo para UPDATE_CREDIT_LIMIT: { "credit_limit_cents": 5000000 }
   * Ejemplo para TOGGLE_CUSTOMER_BLOCK: { "is_active": true }
   *
   * Se guarda el subconjunto mínimo de campos relevantes para la acción,
   * NO la entidad completa (principio de mínima exposición de datos).
   * Nullable para acciones de CREACIÓN (no existe estado previo).
   */
  @Column({ type: 'jsonb', nullable: true })
  old_value: Record<string, unknown> | null;

  /**
   * Snapshot del estado POSTERIOR a la modificación (JSONB en PostgreSQL).
   *
   * Ejemplo: { "credit_limit_cents": 1000000 }
   *
   * La combinación old_value + new_value permite reconstruir el diff completo:
   * qué cambió, en qué dirección y cuánto (crítico para forense financiero).
   */
  @Column({ type: 'jsonb', nullable: true })
  new_value: Record<string, unknown> | null;

  /**
   * Dirección IP del request que generó la acción.
   * Útil en investigaciones forenses: si un admin cambió un límite de crédito
   * desde una IP fuera del negocio, es una señal de alerta de acceso remoto.
   * Nullable para acciones del sistema (Subscribers, Cron Jobs).
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  // ─── TIMESTAMP INMUTABLE ──────────────────────────────────────────────────

  /**
   * Momento exacto en UTC en que se ejecutó la acción.
   * INMUTABLE — no tiene UpdateDateColumn asociada.
   * timestamptz (con timezone) es obligatorio para sistemas multi-región:
   * garantiza comparaciones correctas independientemente del timezone del servidor.
   */
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
