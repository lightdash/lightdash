import { type Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.text('entry_point').notNullable().defaultTo('ask_ai');
        table.text('effort').notNullable().defaultTo('medium');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropColumns('entry_point', 'effort');
    });
}
