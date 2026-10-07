import { Knex } from 'knex';

const TableName = 'ai_prompt_decision_shadow';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty ai_prompt_decision_shadow table; existing tables and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.createTable(TableName, (table) => {
            table
                .uuid('ai_prompt_decision_shadow_uuid')
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
            table.jsonb('questions').notNullable();
            table.jsonb('state').notNullable();
            table.text('live_provider').notNullable();
            table.text('live_model').notNullable();
            table.text('live_outcome').notNullable();
            table.jsonb('live_answers').nullable();
            table.integer('live_latency_ms').notNullable();
            table.integer('live_service_ms').nullable();
            table.text('shadow_provider').notNullable();
            table.text('shadow_model').notNullable();
            table.text('shadow_outcome').notNullable();
            table.jsonb('shadow_answers').nullable();
            table.integer('shadow_latency_ms').notNullable();
            table.integer('shadow_service_ms').nullable();
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
        await knex.schema.dropTableIfExists(TableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
