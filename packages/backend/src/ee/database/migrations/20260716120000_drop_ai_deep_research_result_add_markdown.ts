import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.text('result_markdown');
        table.dropColumn('result');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropColumn('result_markdown');
        table.jsonb('result');
    });
}
