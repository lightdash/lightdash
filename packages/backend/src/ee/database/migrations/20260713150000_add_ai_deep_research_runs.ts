import { AI_DEEP_RESEARCH_RUN_STATUSES } from '@lightdash/common';
import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiDeepResearchRunsTableName, (table) => {
        table
            .uuid('ai_deep_research_run_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.uuid('created_by_user_uuid').notNullable();
        table
            .uuid('ai_thread_uuid')
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('SET NULL');
        table.text('prompt_uuid');
        table.text('tool_call_id');
        table.text('prompt').notNullable();
        table
            .text('status')
            .notNullable()
            .defaultTo('queued')
            .checkIn([...AI_DEEP_RESEARCH_RUN_STATUSES]);
        table.text('claude_session_id');
        table.jsonb('result');
        table.jsonb('budget_snapshot').notNullable();
        table.text('error_message');
        table.timestamp('cancellation_requested_at', { useTz: false });
        table.timestamp('started_at', { useTz: false });
        table.timestamp('completed_at', { useTz: false });
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['organization_uuid', 'created_at']);
        table.index(['project_uuid', 'created_at']);
        table.index(['status', 'updated_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(AiDeepResearchRunsTableName);
}
