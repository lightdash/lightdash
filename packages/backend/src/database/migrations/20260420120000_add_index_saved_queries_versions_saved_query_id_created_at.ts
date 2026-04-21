import { type Knex } from 'knex';

const INDEX_NAME = 'saved_queries_versions_saved_query_id_created_at_idx';

export async function up(knex: Knex): Promise<void> {
    // Knex table.index() does not support per-column sort direction, so we use
    // raw SQL to create the index with created_at DESC. This matches the query
    // pattern in SavedChartModel.findByExploreName():
    //   DISTINCT ON (saved_query_id) ORDER BY saved_query_id, created_at DESC
    //
    // CONCURRENTLY avoids an ACCESS EXCLUSIVE table lock so reads/writes
    // continue during index build. It cannot run inside a transaction, hence
    // config.transaction = false below.
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME}
        ON saved_queries_versions (saved_query_id, created_at DESC)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX_NAME}`);
}

export const config = { transaction: false };
