import {
    MetricQuery,
    type DashboardFilters,
    type DateGranularity,
    type Filters,
    type QueryExecutionContext,
    type ResultsPaginationArgs,
    type SessionUser,
    type SortField,
} from '@lightdash/common';

export type CommonAsyncQueryArgs = {
    user: SessionUser;
    projectUuid: string;
    invalidateCache?: boolean;
    context: QueryExecutionContext;
};

export type GetAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'context' | 'invalidateCache'
> &
    ResultsPaginationArgs & {
        queryUuid: string;
    };

export type ExecuteAsyncMetricQueryArgs = CommonAsyncQueryArgs & {
    metricQuery: MetricQuery;
    granularity?: DateGranularity;
};

export type ExecuteAsyncSavedChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    versionUuid?: string;
};

export type ExecuteAsyncDashboardChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
    granularity?: DateGranularity;
};

export type ExecuteAsyncUnderlyingDataQueryArgs = CommonAsyncQueryArgs & {
    underlyingDataSourceQueryUuid: string;
    filters: Filters;
    underlyingDataItemId?: string;
};
