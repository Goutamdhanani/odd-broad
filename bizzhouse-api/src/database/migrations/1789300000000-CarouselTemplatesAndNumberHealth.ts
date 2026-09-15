import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Carousel ("collage") template support + number health tracking.
 *
 * - templates: templateType (TEXT/CAROUSEL/...), cards jsonb (per-card
 *   mediaId/body/buttons exactly as Gupshup defines them), vertical,
 *   header/footer/example columns to round-trip create/edit.
 * - gupshup_apps: cached Meta quality rating + messaging tier (updated by
 *   the scheduled ratings poll — never per-message), last checked at.
 * - broadcasts: optional pinned sending number; null = health-aware router.
 */
export class CarouselTemplatesAndNumberHealth1789300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "templates"
        ADD COLUMN "template_type" text NOT NULL DEFAULT 'TEXT',
        ADD COLUMN "cards" jsonb DEFAULT NULL,
        ADD COLUMN "vertical" text,
        ADD COLUMN "header_text" text,
        ADD COLUMN "footer_text" text,
        ADD COLUMN "example" text,
        ADD COLUMN "gupshup_template_ids" jsonb DEFAULT '{}'::jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE "gupshup_apps"
        ADD COLUMN "quality_rating" text,
        ADD COLUMN "messaging_tier" text,
        ADD COLUMN "last_ratings_check" TIMESTAMP WITH TIME ZONE;
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcasts"
        ADD COLUMN "gupshup_app_id" text,
        ADD COLUMN "template_variables" jsonb DEFAULT '[]'::jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE "messages"
        ADD COLUMN "gupshup_app_id" text;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_messages_gupshup_app_created"
        ON "messages" ("gupshup_app_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "templates"
        DROP COLUMN IF EXISTS "template_type",
        DROP COLUMN IF EXISTS "cards",
        DROP COLUMN IF EXISTS "vertical",
        DROP COLUMN IF EXISTS "header_text",
        DROP COLUMN IF EXISTS "footer_text",
        DROP COLUMN IF EXISTS "example",
        DROP COLUMN IF EXISTS "gupshup_template_ids";
    `);
    await queryRunner.query(`
      ALTER TABLE "gupshup_apps"
        DROP COLUMN IF EXISTS "quality_rating",
        DROP COLUMN IF EXISTS "messaging_tier",
        DROP COLUMN IF EXISTS "last_ratings_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "broadcasts"
        DROP COLUMN IF EXISTS "gupshup_app_id",
        DROP COLUMN IF EXISTS "template_variables";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_messages_gupshup_app_created";
      ALTER TABLE "messages"
        DROP COLUMN IF EXISTS "gupshup_app_id";
    `);
  }
}
