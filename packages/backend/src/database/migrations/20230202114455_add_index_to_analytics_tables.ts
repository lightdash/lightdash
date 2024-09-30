import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('analytics_chart_views')) {
        await knex.schema.alterTable('analytics_chart_views', (table) => {
            table.index(['chart_uuid']);
        });
    }
    if (await knex.schema.hasTable('analytics_dashboard_views')) {
        await knex.schema.alterTable('analytics_dashboard_views', (table) => {
            table.index(['dashboard_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('analytics_chart_views')) {
        await knex.schema.alterTable('analytics_chart_views', (table) => {
            table.dropIndex(['chart_uuid']);
        });
    }
    if (await knex.schema.hasTable('analytics_dashboard_views')) {
        await knex.schema.alterTable('analytics_dashboard_views', (table) => {
            table.dropIndex(['dashboard_uuid']);
        });
    }
}
