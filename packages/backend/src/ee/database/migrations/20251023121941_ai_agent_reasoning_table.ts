import { Knex } from 'knex';

const AI_AGENT_REASONING_TABLE = 'ai_agent_reasoning';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AI_AGENT_REASONING_TABLE, (table) => {
        table
            .uuid('ai_agent_reasoning_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('ai_prompt_uuid').notNullable();
        table.string('reasoning_id').notNullable().unique();
        table.text('text').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

        table
            .foreign('ai_prompt_uuid')
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');

        table.index('ai_prompt_uuid');
        table.index(['ai_prompt_uuid', 'created_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_AGENT_REASONING_TABLE);
}
