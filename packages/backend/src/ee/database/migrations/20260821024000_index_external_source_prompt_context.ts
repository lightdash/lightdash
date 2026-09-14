import { Knex } from 'knex';

const AiPromptContextTableName = 'ai_prompt_context';
const ExternalSourceContextIndex =
    'ai_prompt_context_external_source_entity_uuid_idx';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Builds a partial prompt-context lookup index without blocking writes',
} as const;

async function dropInvalidIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [ExternalSourceContextIndex, AiPromptContextTableName],
    );
    if ((invalidIndex.rowCount ?? 0) > 0) {
        await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS ??', [
            ExternalSourceContextIndex,
        ]);
    }
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await dropInvalidIndex(knex);
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${ExternalSourceContextIndex} ON ?? (entity_uuid) WHERE entity_type = 'external_source'`,
            [AiPromptContextTableName],
        );
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS ??', [
            ExternalSourceContextIndex,
        ]);
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}
