import { Knex } from 'knex';

const newTableIndexes = {
    cached_explore: ['project_uuid'],
    dashboard_tile_charts: [
        'dashboard_tile_uuid',
        'dashboard_version_id',
        'saved_chart_id',
    ],
    dashboard_tile_looms: ['dashboard_tile_uuid', 'dashboard_version_id'],
    dashboard_tile_markdowns: ['dashboard_tile_uuid', 'dashboard_version_id'],
    dashboard_tiles: ['dashboard_tile_uuid', 'dashboard_version_id'],
    dashboard_versions: ['dashboard_id', 'updated_by_user_uuid'],
    dashboard_views: ['dashboard_version_id'],
    dashboards: ['dashboard_uuid'],
    pinned_chart: ['pinned_list_uuid', 'saved_chart_uuid'],
    pinned_dashboard: ['pinned_list_uuid', 'dashboard_uuid'],
    pinned_space: ['pinned_list_uuid', 'space_uuid'],
    projects: ['organization_id'],
    saved_queries: ['dashboard_uuid', 'last_version_updated_by_user_uuid'],
    saved_queries_version_custom_dimensions: ['saved_queries_version_id'],
    saved_queries_version_custom_sql_dimensions: ['saved_queries_version_id'],
    saved_queries_version: [
        'saved_queries_version_uuid',
        'updated_by_user_uuid',
        'explore_name',
    ],
    spaces: ['project_id'],
};

export async function up(knex: Knex): Promise<void> {
    async function createIndex(table: string, columns: string[]) {
        if (await knex.schema.hasTable(table)) {
            await knex.schema.alterTable(table, (tableBuilder) => {
                columns.forEach((column) => {
                    tableBuilder.index([column]);
                });
            });
        }
    }

    await Promise.all(
        Object.entries(newTableIndexes).map(([table, columns]) =>
            createIndex(table, columns),
        ),
    );
}

export async function down(knex: Knex): Promise<void> {
    async function dropIndex(table: string, columns: string[]) {
        if (await knex.schema.hasTable(table)) {
            await knex.schema.alterTable(table, (tableBuilder) => {
                columns.forEach((column) => {
                    tableBuilder.dropIndex([column]);
                });
            });
        }
    }

    await Promise.all(
        Object.entries(newTableIndexes).map(([table, columns]) =>
            dropIndex(table, columns),
        ),
    );
}
