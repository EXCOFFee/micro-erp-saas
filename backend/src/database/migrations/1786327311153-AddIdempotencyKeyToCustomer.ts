import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría Staff Engineer (M6): agrega idempotency_key a Customer para
 * evitar altas duplicadas en POST /customers (doble-submit, reintento de
 * red). Columna nullable — clientes existentes/creados sin key no se ven
 * afectados. Índice único compuesto (tenant_id, idempotency_key), mismo
 * patrón que Transaction.idempotency_key; Postgres trata cada NULL como
 * distinto en un índice único, así que no hace falta una cláusula WHERE
 * parcial pese a la nulabilidad.
 */
export class AddIdempotencyKeyToCustomer1786327311153 implements MigrationInterface {
  name = 'AddIdempotencyKeyToCustomer1786327311153';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD "idempotency_key" uuid`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customers_tenant_idempotency_key" ON "customers" ("tenant_id", "idempotency_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_customers_tenant_idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP COLUMN "idempotency_key"`,
    );
  }
}
