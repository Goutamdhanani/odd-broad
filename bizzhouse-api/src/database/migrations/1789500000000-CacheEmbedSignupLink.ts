import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec §3.2: Embedded Signup links expire in 5 days; Gupshup caps each
 * app at 5 new links / 40 regenerations — "don't regenerate on every
 * page load, cache it and only refresh when it's actually expired."
 * Cache the last-issued link + its expiry on the app row so a shop who
 * reloads onboarding (or hits Continue twice) reuses the live link and
 * a later server restart doesn't burn the quota.
 */
export class CacheEmbedSignupLink1789500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gupshup_apps"
        ADD COLUMN "embed_link" text,
        ADD COLUMN "embed_link_expires_at" TIMESTAMP WITH TIME ZONE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gupshup_apps"
        DROP COLUMN IF EXISTS "embed_link",
        DROP COLUMN IF EXISTS "embed_link_expires_at";
    `);
  }
}
