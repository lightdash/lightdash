import type { QueryExecutionContext } from '../analytics';
import type { ItemsMap } from '../field';
import type { DashboardFilters } from '../filter';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { ResultsPaginationArgs } from '../paginateResults';
import type { DateGranularity } from '../timeFrames';

type CommonPaginatedQueryRequestParams = {
    context?: QueryExecutionContext;
} & ResultsPaginationArgs;

export type PaginatedMetricQueryRequestParams =
    CommonPaginatedQueryRequestParams & {
        query: MetricQueryRequest;
    };

export type PaginatedQueryIdRequestParams =
    CommonPaginatedQueryRequestParams & {
        queryId: string;
        fields: ItemsMap;
        exploreName: string;
    };

export type PaginatedSavedChartRequestParams =
    CommonPaginatedQueryRequestParams & {
        chartUuid: string;
        versionUuid?: string;
    };

export type PaginatedDashboardChartRequestParams =
    CommonPaginatedQueryRequestParams & {
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        granularity?: DateGranularity;
        autoRefresh?: boolean;
    };

// When paginated with queryId, we need to pass the fields so they can be returned back, this is because atm we cannot calculate the fields because we don't know the metricQuery
export type PaginatedQueryRequestParams =
    | PaginatedMetricQueryRequestParams
    | PaginatedQueryIdRequestParams
    | PaginatedSavedChartRequestParams
    | PaginatedDashboardChartRequestParams;

export function isPaginatedMetricQueryRequest(
    query: PaginatedQueryRequestParams,
): query is PaginatedMetricQueryRequestParams {
    return 'query' in query;
}

export function isPaginatedQueryIdRequest(
    query: PaginatedQueryRequestParams,
): query is PaginatedQueryIdRequestParams {
    return 'queryId' in query && 'fields' in query && 'exploreName' in query;
}

export function isPaginatedDashboardChartRequest(
    query: PaginatedQueryRequestParams,
): query is PaginatedDashboardChartRequestParams {
    return (
        'chartUuid' in query &&
        'dashboardUuid' in query &&
        'dashboardFilters' in query &&
        'dashboardSorts' in query
    );
}

export function isPaginatedSavedChartRequest(
    query: PaginatedQueryRequestParams,
): query is PaginatedSavedChartRequestParams {
    return 'chartUuid' in query && !isPaginatedDashboardChartRequest(query);
}
