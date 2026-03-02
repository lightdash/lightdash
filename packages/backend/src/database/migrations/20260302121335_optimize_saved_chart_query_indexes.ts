import { Knex } from 'knex';

// Disable transaction wrapping so CREATE INDEX CONCURRENTLY can be used.
// Regular CREATE INDEX takes a SHARE lock blocking all writes for the
// duration of the index build. CONCURRENTLY avoids this at the cost of
// not being able to run inside a transaction.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    // 1. Add missing index on saved_queries_version_custom_dimensions(saved_queries_version_id)
    // This table was created in 20231020102654 but missed the index that was added
    // for sibling tables (fields, sorts, table_calculations, additional_metrics) in 20231019161823.
    // Without it, scalar subqueries in findChartsForValidation() do sequential scans.
    // We DROP first to clean up any invalid indexes left by a previous failed attempt.
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS idx_sqv_custom_dimensions_version_id`,
    );
    await knex.raw(`
        CREATE INDEX CONCURRENTLY idx_sqv_custom_dimensions_version_id
        ON saved_queries_version_custom_dimensions (saved_queries_version_id)
    `);

    // 2. Add partial index on saved_queries(space_id) for non-deleted charts.
    // The existing partial index (idx_saved_queries_not_deleted) is on saved_query_uuid,
    // but the heaviest queries filter by space_id via JOINs. This index covers those patterns.
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS idx_saved_queries_space_not_deleted`,
    );
    await knex.raw(`
        CREATE INDEX CONCURRENTLY idx_saved_queries_space_not_deleted
        ON saved_queries (space_id) WHERE deleted_at IS NULL
    `);

    // 3. Add composite index for the MAX(saved_queries_version_id) subquery
    // used by getProjectChartsLastVersionCTE(). This lets PostgreSQL do an
    // index-only scan instead of scanning all versions per chart.
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS idx_sqv_query_version_desc`,
    );
    await knex.raw(`
        CREATE INDEX CONCURRENTLY idx_sqv_query_version_desc
        ON saved_queries_versions (saved_query_id, saved_queries_version_id DESC)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        'DROP INDEX CONCURRENTLY IF EXISTS idx_sqv_custom_dimensions_version_id',
    );
    await knex.raw(
        'DROP INDEX CONCURRENTLY IF EXISTS idx_saved_queries_space_not_deleted',
    );
    await knex.raw(
        'DROP INDEX CONCURRENTLY IF EXISTS idx_sqv_query_version_desc',
    );
}
