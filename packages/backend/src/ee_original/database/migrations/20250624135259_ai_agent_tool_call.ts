import { Knex } from 'knex';

const AiAgentToolCallTableName = 'ai_agent_tool_call';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiAgentToolCallTableName, (table) => {
        table
            .uuid('ai_agent_tool_call_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('ai_prompt_uuid').notNullable();
        table.text('tool_call_id').notNullable();
        table.text('tool_name').notNullable();
        table.jsonb('tool_args').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

        // When a prompt is deleted, all its tool calls should also be deleted
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
    await knex.schema.dropTableIfExists(AiAgentToolCallTableName);
}
