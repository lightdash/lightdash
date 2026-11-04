import { Knex } from 'knex';
import type { Client } from 'pg';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds a secondary index on query_history concurrently while allowing ordinary reads and writes; no table rewrite, and older app versions keep working.',
};

const TableName = 'query_history';
const IndexName = 'query_history_project_explore_created_at_idx';

async function withRestoredTimeouts(
    knex: Knex,
    migrate: (connection: Client) => Promise<void>,
): Promise<void> {
    const connection: Client = await knex.client.acquireConnection();
    try {
        const {
            rows: [timeouts],
        } = await knex
            .raw<{
                rows: [{ lock_timeout: string; statement_timeout: string }];
            }>(
                `SELECT current_setting('lock_timeout') AS lock_timeout,
                        current_setting('statement_timeout') AS statement_timeout`,
            )
            .connection(connection);
        try {
            await migrate(connection);
        } finally {
            await knex
                .raw(
                    `SELECT set_config('lock_timeout', ?, false),
                            set_config('statement_timeout', ?, false)`,
                    [timeouts.lock_timeout, timeouts.statement_timeout],
                )
                .connection(connection);
        }
    } finally {
        await knex.client.releaseConnection(connection);
    }
}

export async function up(knex: Knex): Promise<void> {
    await withRestoredTimeouts(knex, async (connection) => {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw('SET lock_timeout = 0').connection(connection);
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
             ON ${TableName} (project_uuid, (metric_query->>'exploreName'), created_at)`,
            )
            .connection(connection);
    });
}

export async function down(knex: Knex): Promise<void> {
    await withRestoredTimeouts(knex, async (connection) => {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw('SET lock_timeout = 0').connection(connection);
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`)
            .connection(connection);
    });
}
