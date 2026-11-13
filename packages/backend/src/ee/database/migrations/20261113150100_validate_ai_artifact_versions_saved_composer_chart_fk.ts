import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Validates a NOT VALID foreign key under SHARE UPDATE EXCLUSIVE; reads and writes continue, and the column is only ever null on existing rows.',
};

async function changeConstraint(
    knex: Knex,
    direction: 'up' | 'down',
): Promise<void> {
    // Pin every session setting and statement to one connection, then restore the caller's settings.
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
            await knex.raw("SET lock_timeout = '60s'").connection(connection);
            if (direction === 'up') {
                await knex
                    .raw(
                        'ALTER TABLE ai_artifact_versions VALIDATE CONSTRAINT ai_artifact_versions_saved_composer_chart_uuid_foreign',
                    )
                    .connection(connection);
            } else {
                // Back to the NOT VALID state the previous migration leaves; one statement, so a retry is safe.
                await knex
                    .raw(
                        `ALTER TABLE ai_artifact_versions
                         DROP CONSTRAINT IF EXISTS ai_artifact_versions_saved_composer_chart_uuid_foreign,
                         ADD CONSTRAINT ai_artifact_versions_saved_composer_chart_uuid_foreign
                         FOREIGN KEY (saved_composer_chart_uuid)
                         REFERENCES composer_charts (composer_chart_uuid)
                         ON DELETE SET NULL NOT VALID`,
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
    await changeConstraint(knex, 'up');
}

export async function down(knex: Knex): Promise<void> {
    await changeConstraint(knex, 'down');
}
