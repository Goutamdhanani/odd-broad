import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutomationRules1789100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "automation_rules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "name" text NOT NULL,
        "keyword" text NOT NULL,
        "match_type" text NOT NULL DEFAULT 'contains',
        "reply_text" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "triggered_count" integer NOT NULL DEFAULT 0,
        "last_triggered_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_automation_rules_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_automation_rules_shop" ON "automation_rules" ("shop_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "automation_rules";`);
  }
}
