import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted column so write-back can resolve the repo directory that holds content-as-code files',
} as const;

const SETTINGS_TABLE = 'content_as_code_project_settings';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
        table.text('content_path').notNullable().defaultTo('lightdash');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
        table.dropColumn('content_path');
    });
}
