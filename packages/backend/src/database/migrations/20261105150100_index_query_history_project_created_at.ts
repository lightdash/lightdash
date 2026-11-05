import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds a secondary index on query_history concurrently; no lock that blocks reads or writes, no table rewrite, and older app versions keep working.',
};

const TableName = 'query_history';
const IndexName = 'query_history_project_uuid_created_at_idx';

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

export async function up(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        const invalidIndex = await knex
            .raw<{ rowCount: number }>(
                `SELECT 1
                 FROM pg_class
                 JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                 WHERE pg_class.relname = ?
                   AND pg_index.indrelid = ?::regclass
                   AND NOT pg_index.indisvalid`,
                [IndexName, TableName],
            )
            .connection(connection);
        if ((invalidIndex.rowCount ?? 0) > 0) {
            await knex
                .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`)
                .connection(connection);
        }
        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${IndexName}
                 ON ${TableName} (project_uuid, created_at)`,
            )
            .connection(connection);
    });
}

export async function down(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`)
            .connection(connection);
    });
}
