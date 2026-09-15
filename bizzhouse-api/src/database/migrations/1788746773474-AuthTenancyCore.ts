import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthTenancyCore1788746773474 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "slug" text');
    await queryRunner.query('ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid');

    await queryRunner.query(`
      UPDATE "shops"
      SET "slug" = 'shop-' || replace("id"::text, '-', '')
      WHERE "slug" IS NULL
    `);
    await queryRunner.query('ALTER TABLE "shops" ALTER COLUMN "slug" SET NOT NULL');
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "shops" ADD CONSTRAINT "UQ_shops_slug" UNIQUE ("slug");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "shops" ADD CONSTRAINT "FK_shops_owner_user"
          FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      UPDATE "shops" AS shop
      SET "owner_user_id" = owner_user."id"
      FROM "users" AS owner_user
      WHERE owner_user."shop_id" = shop."id"
        AND owner_user."role" = 'shop_owner'
        AND shop."owner_user_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "shops" DROP CONSTRAINT IF EXISTS "FK_shops_owner_user"');
    await queryRunner.query('ALTER TABLE "shops" DROP CONSTRAINT IF EXISTS "UQ_shops_slug"');
    await queryRunner.query('ALTER TABLE "shops" DROP COLUMN IF EXISTS "owner_user_id"');
    await queryRunner.query('ALTER TABLE "shops" DROP COLUMN IF EXISTS "slug"');
  }
}
