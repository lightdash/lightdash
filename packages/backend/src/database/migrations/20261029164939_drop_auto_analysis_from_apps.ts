import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Drops a column nothing reads: code stopped selecting apps.auto_analysis in 3.89.0 (GLITCH-968), at least one release before this runs',
} as const;

const AppsTableName = 'apps';
const Column = 'auto_analysis';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn(Column);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        // As created by 20260921133236_add_auto_analysis_to_apps.ts; the
        // per-row values are gone for good, every app reads back 'inherit'.
        table.text(Column).notNullable().defaultTo('inherit');
    });
}
