import { Knex } from 'knex';

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const COLUMN = 'data_app_auto_analysis_enabled';

export const classification = {
    kind: 'safe',
    reason: 'Drops a column nothing reads: code stopped selecting it in 3.89.0 (GLITCH-968), at least one release before this runs; the table has one row per org',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            // As created by 20260921131921; the stored defaults are gone for
            // good, every org reads back false.
            table.boolean(COLUMN).notNullable().defaultTo(false);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
