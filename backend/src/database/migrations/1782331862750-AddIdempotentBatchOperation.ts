import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotentBatchOperation1782331862750 implements MigrationInterface {
  name = 'AddIdempotentBatchOperation1782331862750';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "idempotent_batch_operations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "idempotency_key" uuid NOT NULL, "operation_type" character varying(50) NOT NULL, "affected_customers" integer NOT NULL, "total_adjustment_cents" bigint NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bc4b27867ca22154682db66fd6f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e31feabce04bd32cadd5458727" ON "idempotent_batch_operations" ("tenant_id", "idempotency_key") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e31feabce04bd32cadd5458727"`,
    );
    await queryRunner.query(`DROP TABLE "idempotent_batch_operations"`);
  }
}
