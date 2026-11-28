import { type Knex } from 'knex';

const DashboardTileComposerChartsTable = 'dashboard_tile_composer_charts';
const ComposerChartsTable = 'composer_charts';
const ChartColumn = 'composer_chart_uuid';

export const classification = {
    kind: 'safe',
    reason: 'Drops NOT NULL on dashboard_tile_composer_charts.composer_chart_uuid and swaps its foreign key from CASCADE to SET NULL; the previous release already reads a composer tile with no chart as a deleted-chart tile',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DashboardTileComposerChartsTable, (table) => {
        table.dropForeign([ChartColumn]);
        table.setNullable(ChartColumn);
        table
            .foreign(ChartColumn)
            .references(ChartColumn)
            .inTable(ComposerChartsTable)
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    // Under CASCADE these rows would have gone with their chart
    await knex(DashboardTileComposerChartsTable)
        .whereNull(ChartColumn)
        .delete();
    await knex.schema.alterTable(DashboardTileComposerChartsTable, (table) => {
        table.dropForeign([ChartColumn]);
        table.dropNullable(ChartColumn);
        table
            .foreign(ChartColumn)
            .references(ChartColumn)
            .inTable(ComposerChartsTable)
            .onDelete('CASCADE');
    });
}
