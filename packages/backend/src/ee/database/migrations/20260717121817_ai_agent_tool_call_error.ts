import { Knex } from 'knex';

const AiAgentToolCallErrorTableName = 'ai_agent_tool_call_error';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiAgentToolCallErrorTableName, (table) => {
        table
            .uuid('ai_agent_tool_call_error_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('ai_prompt_uuid').notNullable();
        table.text('tool_call_id').notNullable();
        table.text('tool_name').notNullable();
        table.text('error_message').notNullable();
        // text, not jsonb — one failure mode is args that aren't valid JSON
        table.text('raw_args').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

        // When a prompt is deleted, all its tool call errors should also be deleted
        table
            .foreign('ai_prompt_uuid')
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');

        table.index('ai_prompt_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentToolCallErrorTableName);
}
