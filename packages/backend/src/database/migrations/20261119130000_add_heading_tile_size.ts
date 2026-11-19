import { Knex } from 'knex';

const DASHBOARD_TILE_HEADINGS_TABLE = 'dashboard_tile_headings';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DASHBOARD_TILE_HEADINGS_TABLE, (table) => {
        // Null means the default size
        table.string('size').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DASHBOARD_TILE_HEADINGS_TABLE, (table) => {
        table.dropColumn('size');
    });
}
