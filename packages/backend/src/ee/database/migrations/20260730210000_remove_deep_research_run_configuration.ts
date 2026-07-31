import type { Knex } from 'knex';

const aiDeepResearchRuns = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiDeepResearchRuns, (table) => {
        table.dropColumns('selected_mcp_server_uuids', 'effort');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiDeepResearchRuns, (table) => {
        table.jsonb('selected_mcp_server_uuids').notNullable().defaultTo('[]');
        table.text('effort').notNullable().defaultTo('medium');
    });
}
