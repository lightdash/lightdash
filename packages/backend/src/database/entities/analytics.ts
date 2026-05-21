import { AnyType } from '@lightdash/common';
import { Knex } from 'knex';

export const AnalyticsChartViewsTableName = 'analytics_chart_views';
export const AnalyticsDashboardViewsTableName = 'analytics_dashboard_views';
export const AnalyticsSqlChartViewsTableName = 'analytics_sql_chart_views';
export const AnalyticsAppViewsTableName = 'analytics_app_views';

export type DbAnalyticsChartViews = {
    analytics_chart_view_uuid: string;
    chart_uuid: string;
    user_uuid: string | null;
    timestamp: Date;
    context: Record<string, AnyType> | null;
};
export type DbAnalyticsDashboardViews = {
    analytics_dashboard_view_uuid: string;
    dashboard_uuid: string;
    user_uuid: string | null;
    timestamp: Date;
    context: Record<string, AnyType> | null;
};
export type DbAnalyticsAppViews = {
    analytics_app_view_uuid: string;
    app_id: string;
    user_uuid: string | null;
    timestamp: Date;
};

export type AnalyticsDashboardViews = Knex.CompositeTableType<
    DbAnalyticsDashboardViews,
    Pick<DbAnalyticsDashboardViews, 'dashboard_uuid' | 'user_uuid'>
>;

export type AnalyticsChartViews = Knex.CompositeTableType<
    DbAnalyticsChartViews,
    Pick<DbAnalyticsChartViews, 'chart_uuid' | 'user_uuid'>
>;

export type AnalyticsAppViews = Knex.CompositeTableType<
    DbAnalyticsAppViews,
    Pick<DbAnalyticsAppViews, 'app_id' | 'user_uuid'>
>;
