import type { QueryExecutionContext } from '../analytics';
import type { DashboardFilters } from '../filter';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { ResultsPaginationArgs } from '../paginateResults';
import type { DateGranularity } from '../timeFrames';

type CommonPaginatedQueryRequestParams = {
    context?: QueryExecutionContext;
} & ResultsPaginationArgs;

export type ExecuteAsyncMetricQueryRequestParams =
    CommonPaginatedQueryRequestParams & {
        query: Omit<MetricQueryRequest, 'csvLimit'>;
    };

export type ExecuteAsyncSavedChartRequestParams =
    CommonPaginatedQueryRequestParams & {
        chartUuid: string;
        versionUuid?: string;
    };

export type ExecuteAsyncDashboardChartRequestParams =
    CommonPaginatedQueryRequestParams & {
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        granularity?: DateGranularity;
    };

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams;

export function isExecuteAsyncMetricQueryRequest(
    query: ExecuteAsyncQueryRequestParams,
): query is ExecuteAsyncMetricQueryRequestParams {
    return 'query' in query;
}

export function isExecuteAsyncDashboardChartRequest(
    query: ExecuteAsyncQueryRequestParams,
): query is ExecuteAsyncDashboardChartRequestParams {
    return (
        'chartUuid' in query &&
        'dashboardUuid' in query &&
        'dashboardFilters' in query &&
        'dashboardSorts' in query
    );
}

export function isExecuteAsyncSavedChartRequest(
    query: ExecuteAsyncQueryRequestParams,
): query is ExecuteAsyncSavedChartRequestParams {
    return 'chartUuid' in query && !isExecuteAsyncDashboardChartRequest(query);
}
