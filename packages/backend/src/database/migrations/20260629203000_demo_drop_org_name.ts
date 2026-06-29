import { Knex } from 'knex';

// [DEMO - DO NOT MERGE] Drops a column the previous release still reads/writes,
// to exercise the release-safety SQL linter -> AI rolling-update review feed.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.dropColumn('organization_name');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.string('organization_name').notNullable().defaultTo('');
    });
}
