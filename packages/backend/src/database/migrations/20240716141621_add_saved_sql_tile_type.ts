import { Knex } from 'knex';

const DashboardTilesTable = 'dashboard_tiles';

const DashboardTileTypesTable = 'dashboard_tile_types';
const DashboardTileSqlChartsTable = 'dashboard_tile_sql_charts';

const sqlChartType = 'sql_chart';
export async function up(knex: Knex): Promise<void> {
    await knex(DashboardTileTypesTable).insert({
        dashboard_tile_type: sqlChartType,
    });

    if (!(await knex.schema.hasTable(DashboardTileSqlChartsTable))) {
        await knex.schema.createTable(DashboardTileSqlChartsTable, (table) => {
            table.integer('dashboard_version_id').notNullable();
            table
                .uuid('dashboard_tile_uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            table
                .uuid('saved_sql_uuid')
                .references('saved_sql_uuid')
                .inTable('saved_sql')
                .onDelete('CASCADE');
            table.text('title').nullable();
            table.boolean('hide_title').defaultTo(false);

            table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(DashboardTilesTable).delete().where('type', sqlChartType);
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', sqlChartType);
    await knex.schema.dropTableIfExists(DashboardTileSqlChartsTable);
}
