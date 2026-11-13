import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Validates a foreign key (SHARE UPDATE EXCLUSIVE, reads and writes continue) and builds a secondary index concurrently; older app versions never read the column.',
};

const ConstraintName = 'ai_artifact_versions_saved_composer_chart_uuid_foreign';
const IndexName = 'ai_artifact_versions_saved_composer_chart_uuid_index';

async function change(knex: Knex, direction: 'up' | 'down'): Promise<void> {
    // Concurrent DDL cannot run in a transaction; pin settings and statements to one connection.
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
        if (!settings) throw new Error('Could not read migration timeouts');

        try {
            await knex.raw('SET statement_timeout = 0').connection(connection);
            if (direction === 'up') {
                await knex
                    .raw("SET lock_timeout = '60s'")
                    .connection(connection);
                await knex
                    .raw(
                        `ALTER TABLE ai_artifact_versions VALIDATE CONSTRAINT ${ConstraintName}`,
                    )
                    .connection(connection);
                await knex.raw('SET lock_timeout = 0').connection(connection);
                const invalid = await knex
                    .raw<{ rows: { invalid: boolean }[] }>(
                        `SELECT NOT indisvalid AS invalid
                         FROM pg_index
                         WHERE indexrelid = to_regclass('ai_artifact_versions_saved_composer_chart_uuid_index')
                           AND indrelid = 'ai_artifact_versions'::regclass`,
                    )
                    .connection(connection);
                if (invalid.rows[0]?.invalid) {
                    await knex
                        .raw(
                            'DROP INDEX CONCURRENTLY IF EXISTS ai_artifact_versions_saved_composer_chart_uuid_index',
                        )
                        .connection(connection);
                }
                await knex
                    .raw(
                        'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_artifact_versions_saved_composer_chart_uuid_index ON ai_artifact_versions (saved_composer_chart_uuid)',
                    )
                    .connection(connection);
            } else {
                await knex.raw('SET lock_timeout = 0').connection(connection);
                await knex
                    .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`)
                    .connection(connection);
            }
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
}

export async function up(knex: Knex): Promise<void> {
    await change(knex, 'up');
}

export async function down(knex: Knex): Promise<void> {
    await change(knex, 'down');
}
