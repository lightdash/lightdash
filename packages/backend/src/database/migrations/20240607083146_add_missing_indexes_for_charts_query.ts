import { Knex } from 'knex';

const newTableSingularIndexes = {
    saved_queries: ['dashboard_uuid'],
    pinned_chart: ['saved_chart_uuid'],
    saved_queries_version: ['explore_name'],
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
