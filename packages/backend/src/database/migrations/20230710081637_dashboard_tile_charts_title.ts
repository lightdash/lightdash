import { Knex } from 'knex';

const DashboardTileChartsTable = 'dashboard_tile_charts';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardTileChartsTable, (tableBuilder) => {
        tableBuilder.string('title').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardTileChartsTable, (tableBuilder) => {
        tableBuilder.dropColumns('title');
    });
}
