import { type Knex } from 'knex';

// CREATE INDEX CONCURRENTLY cannot run inside a transaction. Every step is safe
// to repeat: the index statements are guarded.
//
// Existing prompts are not backfilled. A prompt becomes searchable when it is
// written or updated after the previous migration added the trigger.
export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds secondary indexes concurrently. No table is rewritten, no existing row is updated and older app versions never read the indexed column.',
};

type Run = <T>(sql: string, bindings?: string[]) => Promise<T>;

async function createIndex(
    run: Run,
    table: string,
    index: string,
    createSql: string,
): Promise<void> {
    // An interrupted concurrent build leaves an invalid index that
    // IF NOT EXISTS would silently keep.
    const invalid = await run<{ rows: { invalid: boolean }[] }>(
        `SELECT NOT indisvalid AS invalid
         FROM pg_index
         WHERE indexrelid = to_regclass('${index}')
           AND indrelid = '${table}'::regclass`,
    );
    if (invalid.rows[0]?.invalid) {
        await run(`DROP INDEX CONCURRENTLY IF EXISTS ${index}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  ${table}: building ${index} (concurrently)`);
    await run(createSql);
}

async function migrate(knex: Knex, direction: 'up' | 'down'): Promise<void> {
    // Pin the settings and every statement to one connection.
    const connection = await knex.client.acquireConnection();
    const run: Run = <T>(sql: string, bindings: string[] = []) =>
        knex.raw<T>(sql, bindings).connection(connection) as Promise<T>;
    try {
        const {
            rows: [settings],
        } = await run<{
            rows: { statement_timeout: string; lock_timeout: string }[];
        }>(
            "SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout",
        );
        if (!settings) throw new Error('Could not read migration timeouts');

        try {
            await run('SET statement_timeout = 0');
            await run('SET lock_timeout = 0');
            if (direction === 'up') {
                await createIndex(
                    run,
                    'ai_prompt',
                    'ai_prompt_search_vector_idx',
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_prompt_search_vector_idx ON ai_prompt USING GIN (search_vector)',
                );
                await createIndex(
                    run,
                    'ai_thread',
                    'ai_thread_search_vector_idx',
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_thread_search_vector_idx ON ai_thread USING GIN (search_vector)',
                );
                // Newest-first keyset pagination of one organization's threads.
                await createIndex(
                    run,
                    'ai_thread',
                    'ai_thread_organization_uuid_created_at_idx',
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_thread_organization_uuid_created_at_idx ON ai_thread (organization_uuid, created_at DESC, ai_thread_uuid DESC)',
                );
                // Finding one user's threads without reading every thread of
                // the organization.
                await createIndex(
                    run,
                    'ai_prompt',
                    'ai_prompt_created_by_user_uuid_idx',
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_prompt_created_by_user_uuid_idx ON ai_prompt (created_by_user_uuid)',
                );
                // "Has a failed turn" and "has a rated turn" checks per thread.
                // Both cover only the few turns that failed or were rated.
                await createIndex(
                    run,
                    'ai_prompt',
                    'ai_prompt_thread_error_idx',
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_prompt_thread_error_idx ON ai_prompt (ai_thread_uuid) WHERE error_message IS NOT NULL',
                );
                await createIndex(
                    run,
                    'ai_prompt',
                    'ai_prompt_thread_human_score_idx',
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_prompt_thread_human_score_idx ON ai_prompt (ai_thread_uuid, human_score) WHERE human_score IS NOT NULL',
                );
            } else {
                await run(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_prompt_thread_human_score_idx',
                );
                await run(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_prompt_thread_error_idx',
                );
                await run(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_prompt_search_vector_idx',
                );
                await run(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_thread_search_vector_idx',
                );
                await run(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_thread_organization_uuid_created_at_idx',
                );
                await run(
                    'DROP INDEX CONCURRENTLY IF EXISTS ai_prompt_created_by_user_uuid_idx',
                );
            }
        } finally {
            await run(
                "SELECT set_config('statement_timeout', ?, false), set_config('lock_timeout', ?, false)",
                [settings.statement_timeout, settings.lock_timeout],
            );
        }
    } finally {
        await knex.client.releaseConnection(connection);
    }
}

export async function up(knex: Knex): Promise<void> {
    await migrate(knex, 'up');
}

// Drops the indexes. The previous migration's down() drops the column.
export async function down(knex: Knex): Promise<void> {
    await migrate(knex, 'down');
}
