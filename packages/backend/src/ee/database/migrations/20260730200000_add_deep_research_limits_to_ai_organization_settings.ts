import type { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

const defaultLimits = {
    maxTokens: 10_000_000,
    maxToolCalls: 1_000,
    maxWarehouseQueries: 100,
    maxHypotheses: 5,
};

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table
            .jsonb('deep_research_limits')
            .notNullable()
            .defaultTo(JSON.stringify(defaultLimits));
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.dropColumn('deep_research_limits');
    });
}
