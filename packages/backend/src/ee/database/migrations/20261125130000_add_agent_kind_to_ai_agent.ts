import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: "Adds ai_agent.agent_kind with a default of 'user', so existing rows and older writers keep working, and concurrently builds a partial unique index that no existing row matches.",
};

// Session settings only apply to one connection, so pin every statement to it.
const withDdlSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '60s'").connection(connection);
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
    await withDdlSession(knex, async (connection) => {
        await knex
            .raw(
                "ALTER TABLE ai_agent ADD COLUMN IF NOT EXISTS agent_kind text NOT NULL DEFAULT 'user'",
            )
            .connection(connection);
        const invalidIndex = await knex
            .raw<{ rowCount: number }>(
                `SELECT 1
                 FROM pg_class
                 JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                 WHERE pg_class.relname = 'ai_agent_one_semantic_studio_agent_per_project'
                   AND NOT pg_index.indisvalid`,
            )
            .connection(connection);
        if ((invalidIndex.rowCount ?? 0) > 0) {
            await knex
                .raw(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_agent_one_semantic_studio_agent_per_project',
                )
                .connection(connection);
        }
        // At most one built-in Semantic Studio agent per project.
        await knex
            .raw(
                `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_agent_one_semantic_studio_agent_per_project
                 ON ai_agent (project_uuid)
                 WHERE agent_kind = 'semantic_studio'`,
            )
            .connection(connection);
    });
}

export async function down(knex: Knex): Promise<void> {
    await withDdlSession(knex, async (connection) => {
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS ai_agent_one_semantic_studio_agent_per_project',
            )
            .connection(connection);
        await knex
            .raw('ALTER TABLE ai_agent DROP COLUMN IF EXISTS agent_kind')
            .connection(connection);
    });
}
