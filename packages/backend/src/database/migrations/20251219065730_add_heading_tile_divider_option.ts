import { Knex } from 'knex';

const DASHBOARD_TILE_HEADINGS_TABLE = 'dashboard_tile_headings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_TILE_HEADINGS_TABLE, (table) => {
        table.boolean('show_divider').defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_TILE_HEADINGS_TABLE, (table) => {
        table.dropColumn('show_divider');
    });
}
