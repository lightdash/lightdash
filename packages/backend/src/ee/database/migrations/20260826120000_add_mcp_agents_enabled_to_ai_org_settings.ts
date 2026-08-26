import { Knex } from 'knex';

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const COLUMN = 'mcp_agents_enabled';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean column to a small table (one row per org) and backfills it from a sibling column; no reads affected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            table.boolean(COLUMN).notNullable().defaultTo(true);
        });
        // Snapshot the coupling being split: ai_agents_visible = false used to
        // block agent tools over MCP too, so those orgs must not gain MCP
        // agent access on upgrade.
        await knex(AI_ORG_SETTINGS_TABLE).update({
            [COLUMN]: knex.ref('ai_agents_visible'),
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
