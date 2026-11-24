import { Knex } from 'knex';

const AiPromptTranscriptTableName = 'ai_prompt_transcript';
const AiPromptTableName = 'ai_prompt';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table; raw SQL only sets a lock timeout.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    if (await knex.schema.hasTable(AiPromptTranscriptTableName)) return;
    await knex.schema.createTable(AiPromptTranscriptTableName, (table) => {
        table
            .uuid('ai_prompt_uuid')
            .primary()
            .references('ai_prompt_uuid')
            .inTable(AiPromptTableName)
            .onDelete('CASCADE');
        // json, not jsonb: jsonb reorders object keys, which changes the replayed bytes.
        table
            .json('messages')
            .notNullable()
            .comment(
                "This prompt's own model messages exactly as sent (from its user message through the final response), without system messages or earlier turns.",
            );
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(AiPromptTranscriptTableName);
}
