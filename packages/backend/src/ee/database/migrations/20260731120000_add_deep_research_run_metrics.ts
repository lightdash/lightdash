import type { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.integer('input_tokens').nullable();
        table.integer('output_tokens').nullable();
        table.integer('cache_read_tokens').nullable();
        table.integer('cache_write_tokens').nullable();
        table.integer('reasoning_tokens').nullable();
        table.integer('total_tokens').nullable();
        table.boolean('token_usage_complete').nullable();
        table.integer('duration_ms').nullable();
        table.integer('tool_call_count').nullable();
        table.integer('tool_error_count').nullable();
        table.integer('warehouse_query_count').nullable();
        table.integer('findings_count').nullable();
        table.integer('chart_count').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropColumns(
            'input_tokens',
            'output_tokens',
            'cache_read_tokens',
            'cache_write_tokens',
            'reasoning_tokens',
            'total_tokens',
            'token_usage_complete',
            'duration_ms',
            'tool_call_count',
            'tool_error_count',
            'warehouse_query_count',
            'findings_count',
            'chart_count',
        );
    });
}
