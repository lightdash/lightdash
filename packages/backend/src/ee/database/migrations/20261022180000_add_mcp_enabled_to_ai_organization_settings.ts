import { Knex } from 'knex';

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const COLUMN = 'mcp_enabled';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean to one row per organization; existing MCP access is preserved until an administrator disables it.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            table.boolean(COLUMN).notNullable().defaultTo(true);
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
