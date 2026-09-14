import type { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';
const limitsColumn = 'deep_research_limits';

// Frozen copies of the limit shapes on either side of this migration.
const boundedLimits = {
    maxTokens: 10_000_000,
    maxSteps: 16,
    maxToolCalls: 24,
    maxWarehouseQueries: 15,
    deadlineMs: 600_000,
};

const hypothesisLimits = {
    maxTokens: 10_000_000,
    maxToolCalls: 1_000,
    maxWarehouseQueries: 100,
    maxHypotheses: 5,
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT '${JSON.stringify(
            boundedLimits,
        )}'::jsonb`,
        [aiOrganizationSettings, limitsColumn],
    );
    // Existing rows carry hypothesis-era ceilings that are 40x the new ones,
    // so they are replaced outright rather than merged.
    await knex.raw(
        `UPDATE ?? SET ?? = '${JSON.stringify(boundedLimits)}'::jsonb`,
        [aiOrganizationSettings, limitsColumn],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT '${JSON.stringify(
            hypothesisLimits,
        )}'::jsonb`,
        [aiOrganizationSettings, limitsColumn],
    );
    await knex.raw(
        `UPDATE ?? SET ?? = '${JSON.stringify(hypothesisLimits)}'::jsonb`,
        [aiOrganizationSettings, limitsColumn],
    );
}
