import type { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Backfills the nullable ai_web_app_thread.embed_external_user_id of embedded write-space threads from their first prompt in bounded batches; no schema change.',
} as const;

const BATCH_SIZE = 1000;

// Older embedded write-space threads only recorded the viewer on their prompts.
export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        let updated = 0;
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const result = await knex.raw<{ rowCount: number | null }>(
                `
                WITH batch AS (
                    SELECT t.ai_thread_uuid, first_prompt.external_user_id
                    FROM ai_web_app_thread t
                    CROSS JOIN LATERAL (
                        SELECT wp.external_user_id
                        FROM ai_prompt p
                        JOIN ai_web_app_prompt wp ON wp.ai_prompt_uuid = p.ai_prompt_uuid
                        WHERE p.ai_thread_uuid = t.ai_thread_uuid
                        ORDER BY p.created_at ASC
                        LIMIT 1
                    ) first_prompt
                    WHERE t.embed_external_user_id IS NULL
                        AND (t.embed_space_uuids IS NOT NULL OR t.embed_space_uuid IS NOT NULL)
                        AND first_prompt.external_user_id IS NOT NULL
                    LIMIT ${BATCH_SIZE}
                )
                UPDATE ai_web_app_thread t
                SET embed_external_user_id = batch.external_user_id
                FROM batch
                WHERE t.ai_thread_uuid = batch.ai_thread_uuid
                    AND t.embed_external_user_id IS NULL
                `,
            );
            const rowCount = result.rowCount ?? 0;
            if (rowCount === 0) break;
            updated += rowCount;
            // eslint-disable-next-line no-console
            console.log(
                `Backfilled embed_external_user_id on ${updated} embedded threads`,
            );
        }
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(): Promise<void> {
    throw new Error('irreversible: backfilled viewer ids are not tracked');
}
