import { Knex } from 'knex';

const DashboardTilesTable = 'dashboard_tiles';

const DashboardTileTypesTable = 'dashboard_tile_types';
const DashboardTileSemanticViewerChartsTable =
    'dashboard_tile_semantic_viewer_charts';

const semanticViewerChartType = 'semantic_viewer_chart';

export async function up(knex: Knex): Promise<void> {
    await knex(DashboardTileTypesTable).insert({
        dashboard_tile_type: semanticViewerChartType,
    });

    if (!(await knex.schema.hasTable(DashboardTileSemanticViewerChartsTable))) {
        await knex.schema.createTable(
            DashboardTileSemanticViewerChartsTable,
            (table) => {
                table.integer('dashboard_version_id').notNullable();
                table
                    .uuid('dashboard_tile_uuid')
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));

                table
                    .uuid('saved_semantic_viewer_chart_uuid')
                    .references('saved_semantic_viewer_chart_uuid')
                    .inTable('saved_semantic_viewer_charts')
                    .nullable()
                    .onDelete('CASCADE');
                table.text('title').nullable();
                table.boolean('hide_title').defaultTo(false);

                table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(DashboardTilesTable)
        .delete()
        .where('type', semanticViewerChartType);
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', semanticViewerChartType);
    await knex.schema.dropTableIfExists(DashboardTileSemanticViewerChartsTable);
}
