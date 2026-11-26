import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds secondary indexes on foreign key columns concurrently; no lock that blocks reads or writes, no table rewrite, and older app versions keep working.',
};

const Indexes = [
    {
        name: 'mcp_tool_call_user_uuid_index',
        table: 'mcp_tool_call',
        columns: 'user_uuid',
    },
    {
        name: 'ai_prompt_created_by_user_uuid_index',
        table: 'ai_prompt',
        columns: 'created_by_user_uuid',
    },
    {
        name: 'ai_deep_research_runs_resume_from_run_uuid_index',
        table: 'ai_deep_research_runs',
        columns: 'resume_from_run_uuid',
    },
] as const;

const logProgress = (message: string): void => {
    console.log(`  user delete foreign key indexes: ${message}`);
};

const withConcurrentIndexSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        const {
            rows: [settings],
        } = await knex
            .raw<{
                rows: { statement_timeout: string; lock_timeout: string }[];
            }>(
                "SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout",
            )
            .connection(connection);
        if (!settings)
            throw new Error('Could not read index migration timeouts');
        try {
            await knex.raw('SET statement_timeout = 0').connection(connection);
            await knex.raw('SET lock_timeout = 0').connection(connection);
            await run(connection);
        } finally {
            await knex
                .raw(
                    "SELECT set_config('statement_timeout', ?, false), set_config('lock_timeout', ?, false)",
                    [settings.statement_timeout, settings.lock_timeout],
                )
                .connection(connection);
        }
    } finally {
        await knex.client.releaseConnection(connection);
    }
};

export async function up(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        for (const { name, table, columns } of Indexes) {
            // eslint-disable-next-line no-await-in-loop
            const invalidIndex = await knex
                .raw<{ rowCount: number }>(
                    `SELECT 1
                     FROM pg_class
                     JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                     WHERE pg_class.relname = ?
                       AND pg_index.indrelid = ?::regclass
                       AND NOT pg_index.indisvalid`,
                    [name, table],
                )
                .connection(connection);
            if ((invalidIndex.rowCount ?? 0) > 0) {
                logProgress(`dropping invalid ${name} from a prior run`);
                // eslint-disable-next-line no-await-in-loop
                await knex
                    .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
                    .connection(connection);
            }
            logProgress(`building ${name}`);
            // eslint-disable-next-line no-await-in-loop
            await knex
                .raw(
                    `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} (${columns})`,
                )
                .connection(connection);
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        for (const { name } of Indexes) {
            // eslint-disable-next-line no-await-in-loop
            await knex
                .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
                .connection(connection);
        }
    });
}
