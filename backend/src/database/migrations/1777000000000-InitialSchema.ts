import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1777000000000 implements MigrationInterface {
  name = 'InitialSchema1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Necesaria para uuid_generate_v4() en BD vacías (en Supabase ya existe → no-op).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."tenants_status_enum" AS ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_name" character varying(255) NOT NULL, "subscription_plan" character varying(50) NOT NULL DEFAULT 'FREE', "subscription_expires_at" TIMESTAMP WITH TIME ZONE, "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'TRIAL', "mp_subscription_id" character varying(100), "settings" jsonb NOT NULL DEFAULT '{}', "active_cash_shift_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "full_name" character varying(255) NOT NULL, "phone" character varying(50), "dni" character varying(30), "credit_limit_cents" integer NOT NULL DEFAULT '0', "balance_cents" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "next_payment_promise" date, "is_overdue" boolean NOT NULL DEFAULT false, "auto_block_on_limit" boolean NOT NULL DEFAULT false, "address" character varying(255), "email" character varying(255), "notes" text, "tags" text array, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e0b1e4c73b183f35ce457777da" ON "customers" ("tenant_id", "is_overdue") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df4861e7124c86c0d5dc33e645" ON "customers" ("tenant_id", "balance_cents") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97913f35ac2e435a4463fb50a0" ON "customers" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'CASHIER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "phone" character varying(50), "role" "public"."users_role_enum" NOT NULL DEFAULT 'CASHIER', "is_active" boolean NOT NULL DEFAULT true, "token_version" integer NOT NULL DEFAULT '0', "password_changed_at" TIMESTAMP, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_109638590074998bb72a2f2cf0" ON "users" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum" AS ENUM('DEBT', 'PAYMENT', 'REVERSAL', 'INFLATION_ADJUSTMENT', 'FORGIVENESS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_payment_method_enum" AS ENUM('CASH', 'TRANSFER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "amount_cents" integer NOT NULL, "description" text, "payment_method" "public"."transactions_payment_method_enum", "reference_group_id" uuid, "idempotency_key" uuid NOT NULL, "reversed_transaction_id" uuid, "is_reversed" boolean NOT NULL DEFAULT false, "cash_register_log_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_14f5ed60d7b9772c05c75dd446" ON "transactions" ("tenant_id", "user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e99b350d8d8fba24fa96e1c5fb" ON "transactions" ("tenant_id", "customer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_67374b0d58af204a96bc8b6b7e" ON "transactions" ("tenant_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4f27188c6c1d993bc76aeddcde" ON "transactions" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cash_register_logs_status_enum" AS ENUM('OPEN', 'CLOSED_OK', 'CLOSED_WITH_DISCREPANCY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cash_register_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE, "opening_cash_cents" integer NOT NULL DEFAULT '0', "expected_cash_cents" integer, "actual_cash_cents" integer, "discrepancy_cents" integer, "note" text, "status" "public"."cash_register_logs_status_enum" NOT NULL DEFAULT 'OPEN', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c73e80f767ead5de8d09408a9e0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9cc528c2c606fc72b9bcbd780c" ON "cash_register_logs" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_44d15e349c1d8c5ffba371dc59" ON "cash_register_logs" ("tenant_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c68bbc4531551abd7f827732a" ON "cash_register_logs" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('UPDATE_CREDIT_LIMIT', 'TOGGLE_CUSTOMER_BLOCK', 'UPDATE_PROMISE_DATE', 'MARK_OVERDUE', 'MERGE_CUSTOMERS', 'REVERSE_TRANSACTION', 'FORGIVE_DEBT', 'APPLY_INFLATION', 'DEACTIVATE_USER', 'ACTIVATE_USER', 'RESET_PASSWORD')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "user_id" uuid, "action" "public"."audit_logs_action_enum" NOT NULL, "entity_type" character varying(100) NOT NULL, "entity_id" uuid NOT NULL, "old_value" jsonb, "new_value" jsonb, "ip_address" character varying(45), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_85c204d8e47769ac183b32bf9c" ON "audit_logs" ("entity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_00332e5f694fc9a31ab5111dec" ON "audit_logs" ("tenant_id", "action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_898d14750b88319b89b1ab66cd" ON "audit_logs" ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "external_payment_id" character varying(100) NOT NULL, "tenant_id" uuid NOT NULL, "provider" character varying(50) NOT NULL, "amount_cents" integer NOT NULL, "currency" character varying(10) NOT NULL, "raw_payload" jsonb NOT NULL DEFAULT '{}', "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_484b33ae99072d27d86eb193f4a" UNIQUE ("external_payment_id"), CONSTRAINT "PK_9a4a4a1b1f55bbc868f6a76a597" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3bcd9a95fb107010efc3a1340e" ON "billing_events" ("tenant_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_97913f35ac2e435a4463fb50a01" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_4f27188c6c1d993bc76aeddcded" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_6f09843c214f21a462b54b11e8d" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_9271d952fa71050fa6da78fbc45" FOREIGN KEY ("reversed_transaction_id") REFERENCES "transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_register_logs" ADD CONSTRAINT "FK_5c68bbc4531551abd7f827732a3" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_register_logs" ADD CONSTRAINT "FK_454935deb7d059ba70d54acfe73" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_6f18d459490bb48923b1f40bdb7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_events" ADD CONSTRAINT "FK_3bcd9a95fb107010efc3a1340ea" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_events" DROP CONSTRAINT "FK_3bcd9a95fb107010efc3a1340ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_6f18d459490bb48923b1f40bdb7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_register_logs" DROP CONSTRAINT "FK_454935deb7d059ba70d54acfe73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_register_logs" DROP CONSTRAINT "FK_5c68bbc4531551abd7f827732a3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_9271d952fa71050fa6da78fbc45"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_e9acc6efa76de013e8c1553ed2b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_6f09843c214f21a462b54b11e8d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_4f27188c6c1d993bc76aeddcded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_109638590074998bb72a2f2cf08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_97913f35ac2e435a4463fb50a01"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3bcd9a95fb107010efc3a1340e"`,
    );
    await queryRunner.query(`DROP TABLE "billing_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_898d14750b88319b89b1ab66cd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_00332e5f694fc9a31ab5111dec"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_85c204d8e47769ac183b32bf9c"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c68bbc4531551abd7f827732a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_44d15e349c1d8c5ffba371dc59"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9cc528c2c606fc72b9bcbd780c"`,
    );
    await queryRunner.query(`DROP TABLE "cash_register_logs"`);
    await queryRunner.query(
      `DROP TYPE "public"."cash_register_logs_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4f27188c6c1d993bc76aeddcde"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_67374b0d58af204a96bc8b6b7e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e99b350d8d8fba24fa96e1c5fb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14f5ed60d7b9772c05c75dd446"`,
    );
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."transactions_payment_method_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_109638590074998bb72a2f2cf0"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97913f35ac2e435a4463fb50a0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_df4861e7124c86c0d5dc33e645"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e0b1e4c73b183f35ce457777da"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
  }
}
