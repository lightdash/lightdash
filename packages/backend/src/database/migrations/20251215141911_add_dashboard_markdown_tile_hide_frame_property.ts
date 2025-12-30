import { Knex } from 'knex';

const DASHBOARD_TILE_MARKDOWNS_TABLE = 'dashboard_tile_markdowns';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_TILE_MARKDOWNS_TABLE, (table) => {
        table.boolean('hide_frame').defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_TILE_MARKDOWNS_TABLE, (table) => {
        table.dropColumn('hide_frame');
    });
}
