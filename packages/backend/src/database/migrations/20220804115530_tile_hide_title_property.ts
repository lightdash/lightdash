import { Knex } from 'knex';

const DASHBOARD_TILE_LOOMS_TABLE = 'dashboard_tile_looms';
const DASHBOARD_TILE_CHARTS_TABLE = 'dashboard_tile_charts';

const HideTitleColumn = 'hide_title';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(DASHBOARD_TILE_LOOMS_TABLE, (table) => {
        table.string(HideTitleColumn);
    });
    await knex.schema.table(DASHBOARD_TILE_CHARTS_TABLE, (table) => {
        table.string(HideTitleColumn);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(DASHBOARD_TILE_LOOMS_TABLE, HideTitleColumn)
    ) {
        await knex.schema.table(DASHBOARD_TILE_LOOMS_TABLE, (table) => {
            table.dropColumns(HideTitleColumn);
        });
    }
    if (
        await knex.schema.hasColumn(
            DASHBOARD_TILE_CHARTS_TABLE,
            HideTitleColumn,
        )
    ) {
        await knex.schema.table(DASHBOARD_TILE_CHARTS_TABLE, (table) => {
            table.dropColumns(HideTitleColumn);
        });
    }
}
