import type { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';
const limitsColumn = 'deep_research_limits';
const limitsWithoutHypotheses =
    '{"maxTokens":10000000,"maxToolCalls":1000,"maxWarehouseQueries":100}';
const limitsWithHypotheses =
    '{"maxTokens":10000000,"maxToolCalls":1000,"maxWarehouseQueries":100,"maxHypotheses":5}';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT '${limitsWithoutHypotheses}'::jsonb`,
        [aiOrganizationSettings, limitsColumn],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT '${limitsWithHypotheses}'::jsonb`,
        [aiOrganizationSettings, limitsColumn],
    );
}
