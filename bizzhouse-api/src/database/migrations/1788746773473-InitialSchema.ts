import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1788746773473 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

        // IF NOT EXISTS makes this a safe baseline for development databases that
        // were created before migrations replaced TypeORM synchronize.
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "shops" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "business_name" text NOT NULL,
            "category" text,
            "status" text NOT NULL DEFAULT 'onboarding',
            "wallet_balance_paise" bigint NOT NULL DEFAULT 0,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_shops_id" PRIMARY KEY ("id")
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "users" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "email" text NOT NULL,
            "password_hash" text NOT NULL,
            "name" text NOT NULL,
            "role" text NOT NULL DEFAULT 'shop_owner',
            "shop_id" uuid,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_users_email" UNIQUE ("email"),
            CONSTRAINT "FK_users_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "gupshup_apps" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "shop_id" uuid NOT NULL,
            "gupshup_app_id" text NOT NULL,
            "app_token" text,
            "phone_number" text,
            "onboarding_type" text NOT NULL,
            "waba_status" text NOT NULL DEFAULT 'pending',
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_gupshup_apps_id" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_gupshup_apps_app_id" UNIQUE ("gupshup_app_id"),
            CONSTRAINT "FK_gupshup_apps_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "wallet_transactions" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "shop_id" uuid NOT NULL,
            "type" text NOT NULL,
            "amount_paise" bigint NOT NULL,
            "reference_id" text,
            "balance_after_paise" bigint NOT NULL,
            "description" text,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_wallet_transactions_id" PRIMARY KEY ("id"),
            CONSTRAINT "FK_wallet_transactions_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "contacts" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "shop_id" uuid NOT NULL,
            "wa_id" text NOT NULL,
            "name" text,
            "opted_in" boolean NOT NULL DEFAULT false,
            "tags" text[] NOT NULL DEFAULT '{}',
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_contacts_id" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_contacts_shop_wa_id" UNIQUE ("shop_id", "wa_id"),
            CONSTRAINT "FK_contacts_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "messages" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "shop_id" uuid NOT NULL,
            "contact_id" uuid NOT NULL,
            "direction" text NOT NULL,
            "message_type" text NOT NULL,
            "gupshup_message_id" text,
            "status" text NOT NULL DEFAULT 'queued',
            "cost_paise" bigint,
            "payload" jsonb NOT NULL,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_messages_id" PRIMARY KEY ("id"),
            CONSTRAINT "FK_messages_shop" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT "FK_messages_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
          )
        `);

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "webhook_events" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "gupshup_app_id" text,
            "event_type" text,
            "raw_payload" jsonb NOT NULL,
            "processed" boolean NOT NULL DEFAULT false,
            "received_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "PK_webhook_events_id" PRIMARY KEY ("id")
          )
        `);

        await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_users_shop_id" ON "users" ("shop_id")');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_gupshup_apps_shop_id" ON "gupshup_apps" ("shop_id")');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_shop_created_at" ON "wallet_transactions" ("shop_id", "created_at" DESC)');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_messages_shop_contact_created_at" ON "messages" ("shop_id", "contact_id", "created_at" DESC)');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_messages_gupshup_message_id" ON "messages" ("gupshup_message_id")');
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_webhook_events_processed_received_at" ON "webhook_events" ("processed", "received_at")');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "webhook_events"');
        await queryRunner.query('DROP TABLE IF EXISTS "messages"');
        await queryRunner.query('DROP TABLE IF EXISTS "contacts"');
        await queryRunner.query('DROP TABLE IF EXISTS "wallet_transactions"');
        await queryRunner.query('DROP TABLE IF EXISTS "gupshup_apps"');
        await queryRunner.query('DROP TABLE IF EXISTS "users"');
        await queryRunner.query('DROP TABLE IF EXISTS "shops"');
    }

}
