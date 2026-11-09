import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds a non-unique partial scheduler log index concurrently; application data and compatibility with older app versions are unchanged.',
};

const IndexName = 'scheduler_log_export_history_org_uuid_idx';

const withConcurrentIndexSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        const { rows } = await knex
            .raw<{
                rows: { lock_timeout: string; statement_timeout: string }[];
            }>(
                `SELECT current_setting('lock_timeout') AS lock_timeout,
                        current_setting('statement_timeout') AS statement_timeout`,
            )
            .connection(connection);
        const previous = rows[0];
        try {
            await knex.raw('SET lock_timeout = 0').connection(connection);
            await knex.raw('SET statement_timeout = 0').connection(connection);
            await run(connection);
        } finally {
            await knex
                .raw(
                    `SELECT set_config('lock_timeout', ?, false),
                            set_config('statement_timeout', ?, false)`,
                    [previous.lock_timeout, previous.statement_timeout],
                )
                .connection(connection);
        }
    } finally {
        await knex.client.releaseConnection(connection);
    }
};

export async function up(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        const invalidIndex = await knex
            .raw<{ rowCount: number }>(
                `SELECT 1 FROM pg_index
                 WHERE indexrelid = to_regclass(?)
                   AND indrelid = 'scheduler_log'::regclass
                   AND NOT indisvalid`,
                [IndexName],
            )
            .connection(connection);
        if ((invalidIndex.rowCount ?? 0) > 0) {
            await knex
                .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`)
                .connection(connection);
        }
        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS scheduler_log_export_history_org_uuid_idx
                 ON scheduler_log ((details->>'organizationUuid'), scheduler_log_uuid)
                 WHERE task IN ('downloadAsyncQueryResults', 'uploadGsheetFromQuery')`,
            )
            .connection(connection);
    });
}

export async function down(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS scheduler_log_export_history_org_uuid_idx',
            )
            .connection(connection);
    });
}
