import { Knex } from 'knex';

const DashboardTilesTable = 'dashboard_tiles';
const DashboardTileTypesTable = 'dashboard_tile_types';
const DashboardTileDataAppsTable = 'dashboard_tile_data_apps';
const AppsTable = 'apps';

const dataAppType = 'data_app';

export async function up(knex: Knex): Promise<void> {
    await knex(DashboardTileTypesTable)
        .insert({ dashboard_tile_type: dataAppType })
        .onConflict('dashboard_tile_type')
        .ignore();

    if (!(await knex.schema.hasTable(DashboardTileDataAppsTable))) {
        await knex.schema.createTable(DashboardTileDataAppsTable, (table) => {
            table.integer('dashboard_version_id').notNullable();
            table
                .uuid('dashboard_tile_uuid')
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));

            // Composite FK back to dashboard_tiles so dashboard version
            // deletes don't leave orphans. Mirrors the loom/markdown/heading/
            // chart tile tables — sql_chart skipped this and is the outlier.
            table
                .foreign(['dashboard_version_id', 'dashboard_tile_uuid'])
                .references(['dashboard_version_id', 'dashboard_tile_uuid'])
                .inTable(DashboardTilesTable)
                .onDelete('CASCADE');

            table
                .uuid('app_uuid')
                .references('app_id')
                .inTable(AppsTable)
                .notNullable()
                .onDelete('CASCADE')
                .index();

            table.text('title').nullable();
            table.boolean('hide_title').defaultTo(false);

            table.primary(['dashboard_version_id', 'dashboard_tile_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(DashboardTilesTable).delete().where('type', dataAppType);
    await knex(DashboardTileTypesTable)
        .delete()
        .where('dashboard_tile_type', dataAppType);
    await knex.schema.dropTableIfExists(DashboardTileDataAppsTable);
}
