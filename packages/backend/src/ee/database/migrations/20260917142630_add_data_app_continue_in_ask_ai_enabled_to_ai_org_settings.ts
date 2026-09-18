import { Knex } from 'knex';

const AI_ORG_SETTINGS_TABLE = 'ai_organization_settings';
const COLUMN = 'data_app_continue_in_ask_ai_enabled';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted boolean column to a small table (one row per org); no reads affected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable(AI_ORG_SETTINGS_TABLE, (table) => {
            // Whether viewers may carry a data-app investigation on in Ask AI.
            // On by default; an admin turns it off to keep viewers at the
            // explanation.
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
