import type { ItemsMap } from '../field';
import type { MetricQueryRequest } from '../metricQuery';
import type { ResultsPaginationArgs } from '../paginateResults';

export type PaginatedMetricQueryRequest = { query: MetricQueryRequest };
export type PaginatedQueryIdRequest = {
    queryId: string;
    fields: ItemsMap;
    exploreName: string;
};
export type PaginatedSavedChartRequest = {
    chartUuid: string;
    versionUuid?: string;
};

// When paginated with queryId, we need to pass the fields so they can be returned back, this is because atm we cannot calculate the fields because we don't know the metricQuery
export type PaginatedQueryRequest = (
    | PaginatedMetricQueryRequest
    | PaginatedQueryIdRequest
    | PaginatedSavedChartRequest
) &
    ResultsPaginationArgs;

export function isPaginatedMetricQueryRequest(
    query: PaginatedQueryRequest,
): query is PaginatedMetricQueryRequest {
    return 'query' in query;
}

export function isPaginatedQueryIdRequest(
    query: PaginatedQueryRequest,
): query is PaginatedQueryIdRequest {
    return 'queryId' in query && 'fields' in query && 'exploreName' in query;
}

export function isPaginatedSavedChartRequest(
    query: PaginatedQueryRequest,
): query is PaginatedSavedChartRequest {
    return 'chartUuid' in query;
}
