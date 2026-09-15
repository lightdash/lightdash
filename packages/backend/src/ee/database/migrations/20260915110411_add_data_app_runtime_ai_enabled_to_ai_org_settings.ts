import { Knex } from 'knex';

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const COLUMN = 'data_app_runtime_ai_enabled';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean column to a small table (one row per org); no reads affected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            // Customer consent for data apps to call AI at runtime: off for
            // every org until an admin turns it on.
            table.boolean(COLUMN).notNullable().defaultTo(false);
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
