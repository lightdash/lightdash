import { Knex } from 'knex';

const dashboardTileCommentsTable = 'dashboard_tile_comments';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.alterTable(dashboardTileCommentsTable, (table) => {
        table.text('text_html');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(dashboardTileCommentsTable, 'text_html')) {
        await knex.schema.alterTable(dashboardTileCommentsTable, (table) => {
            table.dropColumn('text_html');
        });
    }
}
