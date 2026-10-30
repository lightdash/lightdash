import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Drops a column nothing reads: code stopped selecting it in 3.89.0 (GLITCH-968), at least one release before this runs; the table has one row per org',
} as const;

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const COLUMN = 'data_app_auto_analysis_enabled';
const LOCK_TIMEOUT = '10s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
        table.dropColumn(COLUMN);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
        // As created by 20260921131921; the stored defaults are gone for
        // good, every org reads back false.
        table.boolean(COLUMN).notNullable().defaultTo(false);
    });
}
