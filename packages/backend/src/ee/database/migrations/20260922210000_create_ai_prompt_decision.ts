import { Knex } from 'knex';

const AiPromptDecisionTableName = 'ai_prompt_decision';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.createTable(AiPromptDecisionTableName, (table) => {
            table
                .uuid('ai_prompt_decision_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('ai_prompt_uuid')
                .notNullable()
                .references('ai_prompt_uuid')
                .inTable('ai_prompt')
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.text('operation').notNullable();
            table.text('outcome').notNullable();
            table.text('reason').nullable();
            table.jsonb('intent').nullable();
            table.boolean('applied').notNullable();
            table.text('fallback_reason').nullable();
            table.boolean('simple_data_answer').notNullable();
            table.jsonb('answers').nullable();
            table.jsonb('thresholds').notNullable();
            table.integer('latency_ms').notNullable();
            table.text('jev_model').notNullable();
            table.index(['ai_prompt_uuid']);
            table.index(['created_at']);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(AiPromptDecisionTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
