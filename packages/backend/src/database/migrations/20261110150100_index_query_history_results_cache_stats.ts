import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds a covering index and a partial index on query_history concurrently, then concurrently drops the index they supersede (same key columns); no lock that blocks reads or writes and older app versions keep working.',
};

const TableName = 'query_history';
const IndexName = 'query_history_project_created_at_covering_idx';
const UnfilledIndexName = 'query_history_project_created_at_unfilled_idx';
const SupersededIndexName = 'query_history_project_uuid_created_at_idx';

// Session settings only apply to one connection, so pin every statement to it.
const withConcurrentIndexSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw('SET lock_timeout = 0').connection(connection);
        await run(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

const dropIfInvalid = async (
    knex: Knex,
    connection: unknown,
    indexName: string,
): Promise<void> => {
    const invalidIndex = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_class
             JOIN pg_index ON pg_index.indexrelid = pg_class.oid
             WHERE pg_class.relname = ?
               AND pg_index.indrelid = ?::regclass
               AND NOT pg_index.indisvalid`,
            [indexName, TableName],
        )
        .connection(connection);
    if ((invalidIndex.rowCount ?? 0) > 0) {
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`)
            .connection(connection);
    }
};

export async function up(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        await dropIfInvalid(knex, connection, IndexName);
        // eslint-disable-next-line no-console
        console.log(`  ${TableName}: building ${IndexName} (concurrently)`);
        // INCLUDE lists every column the results cache stats read, so they run as index-only scans.
        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS query_history_project_created_at_covering_idx
                 ON query_history (project_uuid, created_at)
                 INCLUDE (
                     status,
                     cache_key,
                     cache_miss_reason,
                     cache_refresh_requested,
                     context,
                     results_file_name,
                     results_created_at,
                     warehouse_execution_time_ms,
                     warehouse_bytes_billed,
                     request_chart_uuid,
                     request_saved_sql_uuid,
                     metric_query_explore_name
                 )`,
            )
            .connection(connection);
        await dropIfInvalid(knex, connection, UnfilledIndexName);
        // eslint-disable-next-line no-console
        console.log(
            `  ${TableName}: building ${UnfilledIndexName} (concurrently)`,
        );
        // Rows from before the copied columns existed; new rows never match, and old ones age out with retention.
        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS query_history_project_created_at_unfilled_idx
                 ON query_history (project_uuid, created_at)
                 WHERE metric_query_explore_name IS NULL`,
            )
            .connection(connection);
        // eslint-disable-next-line no-console
        console.log(`  ${TableName}: dropping ${SupersededIndexName}`);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS query_history_project_uuid_created_at_idx',
            )
            .connection(connection);
    });
}

export async function down(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        await dropIfInvalid(knex, connection, SupersededIndexName);
        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS query_history_project_uuid_created_at_idx
                 ON query_history (project_uuid, created_at)`,
            )
            .connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS query_history_project_created_at_unfilled_idx',
            )
            .connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS query_history_project_created_at_covering_idx',
            )
            .connection(connection);
    });
}
