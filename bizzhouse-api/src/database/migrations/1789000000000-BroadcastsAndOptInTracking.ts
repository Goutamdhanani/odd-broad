import { MigrationInterface, QueryRunner } from 'typeorm';

export class BroadcastsAndOptInTracking1789000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcasts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "name" text NOT NULL,
        "template_name" text NOT NULL,
        "template_language" text NOT NULL DEFAULT 'en',
        "template_components" jsonb DEFAULT '[]',
        "audience_tag" text,
        "status" text NOT NULL DEFAULT 'queued',
        "total_recipients" integer NOT NULL DEFAULT 0,
        "sent_count" integer NOT NULL DEFAULT 0,
        "failed_count" integer NOT NULL DEFAULT 0,
        "skipped_count" integer NOT NULL DEFAULT 0,
        "cost_paise" bigint NOT NULL DEFAULT 0,
        "error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_broadcasts_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcasts_shop_id" ON "broadcasts" ("shop_id");
    `);

    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "opted_in_at" TIMESTAMP WITH TIME ZONE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcasts";`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "opted_in_at";`);
  }
}
