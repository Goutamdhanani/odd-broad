import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateCardsTable1788746773476 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "last_inbound_at" TIMESTAMP WITH TIME ZONE;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category" text NOT NULL,
        "country_code" text NOT NULL DEFAULT 'IN',
        "cost_paise" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rate_cards_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rate_cards_category_country" UNIQUE ("category", "country_code")
      );
    `);

    await queryRunner.query(`
      INSERT INTO "rate_cards" ("category", "country_code", "cost_paise") VALUES
        ('marketing', 'IN', 150),
        ('utility', 'IN', 30),
        ('authentication', 'IN', 30),
        ('service', 'IN', 0),
        ('marketing', 'DEFAULT', 200),
        ('utility', 'DEFAULT', 50),
        ('authentication', 'DEFAULT', 50),
        ('service', 'DEFAULT', 0)
      ON CONFLICT ("category", "country_code") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_cards";`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "last_inbound_at";`);
  }
}
