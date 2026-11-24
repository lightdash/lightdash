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
                "This prompt's assistant and tool messages exactly as sent, from its first tool call to its last tool result.",
            );
        table
            .integer('format_version')
            .notNullable()
            .comment('Rows of another format version are not replayed.');
        table
            .text('model')
            .notNullable()
            .comment(
                'Provider and model id that ran the turn; replayed only to the same model.',
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
