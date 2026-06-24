import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Entidad IdempotentBatchOperation — Idempotencia de operaciones BATCH (CU-TX-05).
 *
 * MOTIVACIÓN (bug crítico corregido):
 * Las operaciones batch (ej: ajuste por inflación) generan MÚLTIPLES filas
 * Transaction en una sola llamada. Antes, todas esas filas compartían el
 * mismo `idempotency_key` del request, lo que violaba el índice único
 * `UNIQUE(tenant_id, idempotency_key)` de Transaction en cuanto había 2+
 * deudores → Postgres hacía rollback de TODO el batch.
 *
 * SOLUCIÓN (separación de responsabilidades):
 * - La idempotencia del BATCH vive en esta tabla: una fila por operación batch,
 *   protegida por `UNIQUE(tenant_id, idempotency_key)`.
 * - Cada Transaction individual del batch usa su PROPIA `idempotency_key`
 *   única (randomUUID), porque su unicidad ya no es lo que protege contra
 *   reintentos duplicados.
 *
 * BENEFICIO SECUNDARIO:
 * Esta tabla guarda el resultado del batch (affected_customers,
 * total_adjustment_cents). Así, un reintento detectado puede devolver el
 * resultado REAL de la operación original en vez de ceros.
 */
@Entity('idempotent_batch_operations')
@Index(['tenant_id', 'idempotency_key'], { unique: true })
export class IdempotentBatchOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * FK lógica al comercio. La idempotencia es POR tenant: dos tenants
   * distintos pueden generar el mismo UUID sin conflicto.
   */
  @Column({ type: 'uuid' })
  tenant_id: string;

  /**
   * Clave de idempotencia del request batch (UUID generado en el frontend).
   * UNIQUE(tenant_id, idempotency_key) garantiza que un reintento no
   * re-ejecute el batch.
   */
  @Column({ type: 'uuid' })
  idempotency_key: string;

  /**
   * Tipo de operación batch (ej: 'INFLATION_ADJUSTMENT').
   * Permite distinguir distintas clases de operaciones batch a futuro.
   */
  @Column({ type: 'varchar', length: 50 })
  operation_type: string;

  /**
   * Cantidad de clientes afectados por el batch original.
   * Se devuelve tal cual ante un reintento idempotente.
   */
  @Column({ type: 'int' })
  affected_customers: number;

  /**
   * Suma total de los ajustes (en centavos) del batch original.
   * `bigint` para no desbordar en tenants con gran volumen de deuda.
   */
  @Column({ type: 'bigint' })
  total_adjustment_cents: number;

  @CreateDateColumn()
  created_at: Date;
}
