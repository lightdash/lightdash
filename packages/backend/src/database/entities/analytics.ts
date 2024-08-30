import { Knex } from 'knex';

export const AnalyticsChartViewsTableName = 'analytics_chart_views';
export const AnalyticsDashboardViewsTableName = 'analytics_dashboard_views';
export const AnalyticsSqlChartViewsTableName = 'analytics_sql_chart_views';

export type DbAnalyticsChartViews = {
    chart_uuid: string;
    user_uuid: string;
    timestamp: Date;
    context: Record<string, any>;
};
export type DbAnalyticsDashboardViews = {
    dashboard_uuid: string;
    user_uuid: string;
    timestamp: Date;
    context: Record<string, any>;
};

export type AnalyticsDashboardViews = Knex.CompositeTableType<
    DbAnalyticsChartViews,
    Pick<DbAnalyticsDashboardViews, 'dashboard_uuid' | 'user_uuid' | 'context'>
>;

export type AnalyticsChartViews = Knex.CompositeTableType<
    DbAnalyticsChartViews,
    Pick<DbAnalyticsChartViews, 'chart_uuid' | 'user_uuid' | 'context'>
>;
