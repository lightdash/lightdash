import type { QueryExecutionContext } from '../analytics';
import type { DashboardFilters, Filters } from '../filter';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { DateGranularity } from '../timeFrames';

type CommonPaginatedQueryRequestParams = {
    context?: QueryExecutionContext;
    invalidateCache?: boolean;
};

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

export type ExecuteAsyncSqlQueryRequestParams =
    ExecuteAsyncDashboardChartRequestParams & {
        sql: string;
    };

export type ExecuteAsyncUnderlyingDataRequestParams =
    CommonPaginatedQueryRequestParams & {
        underlyingDataSourceQueryUuid: string;
        underlyingDataItemId?: string;
        filters: Filters;
    };

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams
    | ExecuteAsyncUnderlyingDataRequestParams;
