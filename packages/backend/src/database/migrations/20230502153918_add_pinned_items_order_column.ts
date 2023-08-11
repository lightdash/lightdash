import { Knex } from 'knex';

const PinnedChartTableName = 'pinned_chart';
const PinnedDashboardTableName = 'pinned_dashboard';
const PinnedSpaceTableName = 'pinned_space';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PinnedChartTableName, (table) => {
        table.integer('order').notNullable().defaultTo(100);
    });
    await knex.schema.alterTable(PinnedDashboardTableName, (table) => {
        table.integer('order').notNullable().defaultTo(100);
    });
    await knex.schema.alterTable(PinnedSpaceTableName, (table) => {
        table.integer('order').notNullable().defaultTo(100);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PinnedChartTableName, (table) => {
        table.dropColumn('order');
    });
    await knex.schema.alterTable(PinnedDashboardTableName, (table) => {
        table.dropColumn('order');
    });
    await knex.schema.alterTable(PinnedSpaceTableName, (table) => {
        table.dropColumn('order');
    });
}
