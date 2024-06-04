import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('dashboards')) {
        await knex.schema.table('dashboards', (table) => {
            table.integer('views_count').defaultTo(0).notNullable();
            table.timestamp('first_viewed_at').nullable();
            table.timestamp('last_viewed_at').nullable();
        });
        await knex('dashboards').update({
            // @ts-ignore
            views_count: knex('analytics_dashboard_views')
                .count('dashboard_uuid')
                .whereRaw(
                    'analytics_dashboard_views.dashboard_uuid = dashboards.dashboard_uuid',
                ),
            // @ts-ignore
            first_viewed_at: knex('analytics_dashboard_views')
                .select('timestamp')
                .whereRaw(
                    'analytics_dashboard_views.dashboard_uuid = dashboards.dashboard_uuid',
                )
                .orderBy('timestamp', 'asc')
                .limit(1),
            // @ts-ignore
            last_viewed_at: knex('analytics_dashboard_views')
                .select('timestamp')
                .whereRaw(
                    'analytics_dashboard_views.dashboard_uuid = dashboards.dashboard_uuid',
                )
                .orderBy('timestamp', 'desc')
                .limit(1),
        });
    }
    if (await knex.schema.hasTable('saved_queries')) {
        await knex.schema.table('saved_queries', (table) => {
            table.integer('views_count').defaultTo(0).notNullable();
            table.timestamp('first_viewed_at').nullable();
            table.timestamp('last_viewed_at').nullable();
        });
        await knex('saved_queries').update({
            // @ts-ignore
            views_count: knex('analytics_chart_views')
                .count('chart_uuid')
                .whereRaw(
                    'analytics_chart_views.chart_uuid = saved_queries.saved_query_uuid',
                ),
            // @ts-ignore
            first_viewed_at: knex('analytics_chart_views')
                .select('timestamp')
                .whereRaw(
                    'analytics_chart_views.chart_uuid = saved_queries.saved_query_uuid',
                )
                .orderBy('timestamp', 'asc')
                .limit(1),
            // @ts-ignore
            last_viewed_at: knex('analytics_chart_views')
                .select('timestamp')
                .whereRaw(
                    'analytics_chart_views.chart_uuid = saved_queries.saved_query_uuid',
                )
                .orderBy('timestamp', 'desc')
                .limit(1),
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('dashboards')) {
        await knex.schema.table('dashboards', (table) => {
            table.dropColumn('views_count');
            table.dropColumn('first_viewed_at');
            table.dropColumn('last_viewed_at');
        });
    }
    if (await knex.schema.hasTable('saved_queries')) {
        await knex.schema.table('saved_queries', (table) => {
            table.dropColumn('views_count');
            table.dropColumn('first_viewed_at');
            table.dropColumn('last_viewed_at');
        });
    }
}
