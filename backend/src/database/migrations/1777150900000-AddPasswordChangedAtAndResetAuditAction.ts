import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordChangedAtAndResetAuditAction1777150900000 implements MigrationInterface {
  name = 'AddPasswordChangedAtAndResetAuditAction1777150900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs_action_enum') THEN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'audit_logs_action_enum'
              AND e.enumlabel = 'RESET_PASSWORD'
          ) THEN
            ALTER TYPE "audit_logs_action_enum" ADD VALUE 'RESET_PASSWORD';
          END IF;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "password_changed_at"`,
    );
  }
}
