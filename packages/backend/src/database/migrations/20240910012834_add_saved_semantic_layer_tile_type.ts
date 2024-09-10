import { Knex } from 'knex';

const DashboardTilesTable = 'dashboard_tiles';

// dashboard_tile_sql_charts;

const DashboardTileTypesTable = 'dashboard_tile_types';
const DashboardTileSemanticLayerChartsTable =
    'dashboard_tile_semantic_layer_charts';

const semanticLayerChartType = 'semantic_layer_chart';

export async function up(knex: Knex): Promise<void> {
    await knex(DashboardTileTypesTable).insert({
        dashboard_tile_type: semanticLayerChartType,
    });

    if (!(await knex.schema.hasTable(DashboardTileSemanticLayerChartsTable))) {
        await knex.schema.createTable(
            DashboardTileSemanticLayerChartsTable,
            (table) => {
                table.integer('dashboard_version_id').notNullable();
                table
                    .uuid('dashboard_tile_uuid')
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));

                table
                    .uuid('saved_semantic_layer_uuid')
                    .references('saved_semantic_layer_uuid')
                    .inTable('saved_semantic_layers')
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
        .where('type', semanticLayerChartType);
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', semanticLayerChartType);
    await knex.schema.dropTableIfExists(DashboardTileSemanticLayerChartsTable);
}
