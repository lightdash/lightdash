import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    // Add index for efficient temporal queries when finding chart versions by timestamp
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_chart_versions_lookup 
        ON saved_queries_versions(saved_query_id, created_at DESC)
    `);
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.raw(`DROP INDEX IF EXISTS idx_chart_versions_lookup`);
};
