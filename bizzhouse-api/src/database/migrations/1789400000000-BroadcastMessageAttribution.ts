import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec §2.1: campaign summary shows sent/delivered/read/failed fed by the
 * §3.5 status webhooks. Statuses land on `messages` rows; for them to roll
 * up to a broadcast, each send must carry the broadcast's id.
 */
export class BroadcastMessageAttribution1789400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "messages" ADD COLUMN "broadcast_id" uuid;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_messages_broadcast_status"
        ON "messages" ("broadcast_id", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_messages_broadcast_status";`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN IF EXISTS "broadcast_id";`);
  }
}
