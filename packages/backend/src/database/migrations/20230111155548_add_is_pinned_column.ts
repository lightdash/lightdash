import { Knex } from 'knex';

const DashboardsTableName = 'dashboards';
const SavedChartsTableName = 'saved_queries';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardsTableName, (tableBuilder) => {
        tableBuilder.boolean('is_pinned').notNullable().defaultTo(false);
    });
    await knex.schema.alterTable(SavedChartsTableName, (tableBuilder) => {
        tableBuilder.boolean('is_pinned').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(DashboardsTableName, 'is_pinned')) {
        await knex.schema.alterTable(DashboardsTableName, (tableBuilder) => {
            tableBuilder.dropColumn('is_pinned');
        });
    }
    if (await knex.schema.hasColumn(SavedChartsTableName, 'is_pinned')) {
        await knex.schema.alterTable(SavedChartsTableName, (tableBuilder) => {
            tableBuilder.dropColumn('is_pinned');
        });
    }
}
