import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const AiAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    await knex(AiDeepResearchRunsTableName).delete();

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropForeign('ai_thread_uuid');
        table.dropColumn('prompt_uuid');
    });

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.uuid('ai_thread_uuid').notNullable().alter();
        table
            .foreign('ai_thread_uuid')
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('CASCADE');
        table
            .uuid('prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');
        table
            .uuid('agent_uuid')
            .notNullable()
            .references('ai_agent_uuid')
            .inTable(AiAgentTableName)
            .onDelete('CASCADE');
        table.jsonb('selected_mcp_server_uuids').notNullable();
        table.jsonb('execution_context_snapshot').notNullable();
        table.dropColumn('claude_session_id');
        table.index(['agent_uuid', 'created_at']);
        table.index(['ai_thread_uuid', 'created_at']);
        table.unique(['prompt_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(AiDeepResearchRunsTableName).delete();

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropForeign('prompt_uuid');
        table.dropForeign('ai_thread_uuid');
        table.dropUnique(['prompt_uuid']);
        table.dropIndex(['ai_thread_uuid', 'created_at']);
        table.dropIndex(['agent_uuid', 'created_at']);
    });

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropColumn('prompt_uuid');
    });

    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.uuid('ai_thread_uuid').nullable().alter();
        table.text('prompt_uuid').nullable();
        table
            .foreign('ai_thread_uuid')
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('SET NULL');
        table.dropColumn('selected_mcp_server_uuids');
        table.dropColumn('execution_context_snapshot');
        table.dropColumn('agent_uuid');
        table.text('claude_session_id');
    });
}
