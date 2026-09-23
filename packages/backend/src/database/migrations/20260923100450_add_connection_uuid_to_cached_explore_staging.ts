import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable connection identity column to the cached explore staging table',
} as const;

const CachedExploreStagingTableName = 'cached_explore_staging';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${CachedExploreStagingTableName} ADD COLUMN IF NOT EXISTS connection_uuid uuid NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${CachedExploreStagingTableName} DROP COLUMN IF EXISTS connection_uuid`,
    );
}
