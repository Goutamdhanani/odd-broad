import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamAndAssignment1789200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Conversation assignment lives on the contact (one thread per contact)
    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_assigned_user" ON "contacts" ("assigned_user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "assigned_user_id";
    `);
  }
}
