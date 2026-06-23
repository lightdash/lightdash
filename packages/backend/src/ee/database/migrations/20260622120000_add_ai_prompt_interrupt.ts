import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const AI_PROMPT_INTERRUPT_TABLE_NAME = 'ai_prompt_interrupt';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AI_PROMPT_INTERRUPT_TABLE_NAME, (table) => {
        table
            .uuid('ai_prompt_interrupt_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable(AI_PROMPT_TABLE_NAME)
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['ai_prompt_uuid']);
        table.index(['created_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_PROMPT_INTERRUPT_TABLE_NAME);
}
