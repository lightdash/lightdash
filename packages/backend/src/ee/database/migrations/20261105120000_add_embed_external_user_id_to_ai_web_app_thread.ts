import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable ai_web_app_thread.embed_external_user_id column without a default or backfill; older pods ignore it.',
} as const;

const tableName = 'ai_web_app_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(
        `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS embed_external_user_id TEXT NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(
        `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS embed_external_user_id`,
    );
}
