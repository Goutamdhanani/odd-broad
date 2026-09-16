import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inbound dedupe backstop: Gupshup retries any webhook it doesn't get a
 * 2xx from within 10s (and admins can replay events), so the same wamid can
 * arrive twice — storeInboundMessage's check-then-insert races against a
 * concurrent retry. A partial unique index makes duplicates impossible at
 * the DB level (NULLs excluded: queued outbound rows have no provider id yet).
 */
export class UniqueMessageIdIndex1789600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safety: if duplicates already exist (shouldn't — same wamid would
    // have been re-delivered post-retry), keep the OLDEST row per id.
    await queryRunner.query(`
      DELETE FROM messages a
      USING messages b
      WHERE a.gupshup_message_id IS NOT NULL
        AND a.gupshup_message_id = b.gupshup_message_id
        AND a.created_at > b.created_at
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_messages_gupshup_message_id"
        ON "messages" ("gupshup_message_id")
        WHERE "gupshup_message_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_messages_gupshup_message_id";`);
  }
}
