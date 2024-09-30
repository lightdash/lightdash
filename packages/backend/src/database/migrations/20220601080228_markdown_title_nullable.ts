import { Knex } from 'knex';

const DASHBOARD_TILE_MARKDOWNS_TABLE = 'dashboard_tile_markdowns';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        DASHBOARD_TILE_MARKDOWNS_TABLE,
        (tableBuilder) => {
            tableBuilder.text('title').nullable().alter();
            tableBuilder.text('content').nullable().alter();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex(DASHBOARD_TILE_MARKDOWNS_TABLE).delete().whereNull('title');
    await knex(DASHBOARD_TILE_MARKDOWNS_TABLE).delete().whereNull('content');
    await knex.schema.alterTable(
        DASHBOARD_TILE_MARKDOWNS_TABLE,
        (tableBuilder) => {
            tableBuilder.text('title').notNullable().alter();
            tableBuilder.text('content').notNullable().alter();
        },
    );
}
