import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable ai_web_app_thread.embed_space_uuids column without a default or backfill; readers fall back to embed_space_uuid, which older pods keep reading and writing.',
} as const;

const tableName = 'ai_web_app_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS embed_space_uuids UUID[] NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS embed_space_uuids`,
    );
}
