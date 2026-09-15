import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTemplatesTable1788746773475 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."templates_category_enum" AS ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION');
      CREATE TYPE "public"."templates_status_enum" AS ENUM('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');
    `);

    await queryRunner.query(`
      CREATE TABLE "templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "element_name" text NOT NULL,
        "category" "public"."templates_category_enum" NOT NULL DEFAULT 'MARKETING',
        "language" text NOT NULL DEFAULT 'en_US',
        "status" "public"."templates_status_enum" NOT NULL DEFAULT 'IN_REVIEW',
        "body" text NOT NULL,
        "buttons" jsonb DEFAULT '[]'::jsonb,
        "gupshup_template_id" text,
        "rejection_reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_templates_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_templates_shop_element_name" UNIQUE ("shop_id", "element_name"),
        CONSTRAINT "FK_templates_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "templates";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."templates_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."templates_category_enum";`);
  }
}
