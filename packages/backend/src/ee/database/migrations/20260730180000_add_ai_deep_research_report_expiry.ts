import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.timestamp('report_expires_at', { useTz: true }).nullable();
        table.timestamp('report_expired_at', { useTz: true }).nullable();
        table.index(
            ['report_expires_at', 'report_expired_at'],
            'ai_deep_research_runs_report_expiry_idx',
        );
    });

    await knex(AiDeepResearchRunsTableName)
        .whereIn('status', ['completed', 'partially_completed'])
        .whereNotNull('completed_at')
        .where((query) =>
            query
                .whereNotNull('result_markdown')
                .orWhereNotNull('result_chart_data'),
        )
        .update({
            report_expires_at: knex.raw("completed_at + interval '30 days'"),
        });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropIndex(
            ['report_expires_at', 'report_expired_at'],
            'ai_deep_research_runs_report_expiry_idx',
        );
        table.dropColumn('report_expired_at');
        table.dropColumn('report_expires_at');
    });
}
