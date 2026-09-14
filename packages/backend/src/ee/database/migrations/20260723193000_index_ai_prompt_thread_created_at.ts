import { Knex } from 'knex';

const AiPromptTableName = 'ai_prompt';
const AiPromptThreadCreatedAtIndex =
    'ai_prompt_ai_thread_uuid_created_at_index';

export const config = { transaction: false };

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

async function dropInvalidIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [AiPromptThreadCreatedAtIndex, AiPromptTableName],
    );

    if (getRowCount(invalidIndex) > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [
            AiPromptThreadCreatedAtIndex,
        ]);
    }
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await dropInvalidIndex(knex);
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (??, ??)`,
            [
                AiPromptThreadCreatedAtIndex,
                AiPromptTableName,
                'ai_thread_uuid',
                'created_at',
            ],
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [
            AiPromptThreadCreatedAtIndex,
        ]);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
