import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a secondary index concurrently without rewriting rows or changing the schema older application versions use.',
};

async function changeIndex(
    knex: Knex,
    direction: 'up' | 'down',
): Promise<void> {
    // Concurrent DDL cannot run in a transaction. Pin every session setting and
    // statement to the same connection, then restore the caller's settings.
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
            await knex.raw("SET lock_timeout = '5s'").connection(connection);
            if (direction === 'up') {
                const invalid = await knex
                    .raw<{ rows: { invalid: boolean }[] }>(
                        `SELECT NOT indisvalid AS invalid
                     FROM pg_index
                     WHERE indexrelid = to_regclass('apps_space_uuid_index')
                       AND indrelid = 'apps'::regclass`,
                    )
                    .connection(connection);
                if (invalid.rows[0]?.invalid) {
                    await knex
                        .raw(
                            'DROP INDEX CONCURRENTLY IF EXISTS apps_space_uuid_index',
                        )
                        .connection(connection);
                }
                await knex
                    .raw(
                        'CREATE INDEX CONCURRENTLY IF NOT EXISTS apps_space_uuid_index ON apps (space_uuid)',
                    )
                    .connection(connection);
            } else {
                await knex
                    .raw(
                        'DROP INDEX CONCURRENTLY IF EXISTS apps_space_uuid_index',
                    )
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
    await changeIndex(knex, 'up');
}

export async function down(knex: Knex): Promise<void> {
    await changeIndex(knex, 'down');
}
