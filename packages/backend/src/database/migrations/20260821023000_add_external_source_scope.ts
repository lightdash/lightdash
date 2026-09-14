import { Knex } from 'knex';

const EXTERNAL_SOURCES_TABLE = 'external_sources';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(EXTERNAL_SOURCES_TABLE, (table) => {
        table.string('scope').nullable().defaultTo('catalog');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(EXTERNAL_SOURCES_TABLE, (table) => {
        table.dropColumn('scope');
    });
}
