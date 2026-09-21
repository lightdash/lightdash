import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds one defaulted text column to apps; existing rows read back as the org default without a rewrite',
} as const;

const AppsTableName = 'apps';
const Column = 'auto_analysis';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        // 'inherit' | 'on' | 'off': whether AI analysis runs when the app
        // loads; 'inherit' takes the organization default.
        table.text(Column).notNullable().defaultTo('inherit');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn(Column);
    });
}
