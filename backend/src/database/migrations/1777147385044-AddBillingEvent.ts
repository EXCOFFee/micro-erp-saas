import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBillingEvent1777147385044 implements MigrationInterface {
    name = 'AddBillingEvent1777147385044'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "billing_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "external_payment_id" character varying(100) NOT NULL, "tenant_id" uuid NOT NULL, "provider" character varying(50) NOT NULL, "amount_cents" integer NOT NULL, "currency" character varying(10) NOT NULL, "raw_payload" jsonb NOT NULL DEFAULT '{}', "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_484b33ae99072d27d86eb193f4a" UNIQUE ("external_payment_id"), CONSTRAINT "PK_9a4a4a1b1f55bbc868f6a76a597" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3bcd9a95fb107010efc3a1340e" ON "billing_events" ("tenant_id") `);
        await queryRunner.query(`ALTER TABLE "billing_events" ADD CONSTRAINT "FK_3bcd9a95fb107010efc3a1340ea" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "billing_events" DROP CONSTRAINT "FK_3bcd9a95fb107010efc3a1340ea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bcd9a95fb107010efc3a1340e"`);
        await queryRunner.query(`DROP TABLE "billing_events"`);
    }

}
