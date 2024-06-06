import { Knex } from 'knex';

const newTableSingularIndexes = {
    dashboard_versions: ['dashboard_id', 'updated_by_user_uuid'],
    spaces: ['project_id'],
    projects: ['organization_id'],
    pinned_dashboard: ['pinned_list_uuid', 'dashboard_uuid'],
    dashboard_tile_charts: ['saved_chart_id'],
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
        Object.entries(newTableSingularIndexes).map(([table, columns]) =>
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
        Object.entries(newTableSingularIndexes).map(([table, columns]) =>
            dropIndex(table, columns),
        ),
    );
}
