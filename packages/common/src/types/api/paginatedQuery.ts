import {
    type GroupByColumn,
    type PivotIndexColum,
    type SortBy,
    type ValuesColumn,
} from '../..';
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
    CommonPaginatedQueryRequestParams & {
        sql: string;
        pivotConfiguration?: {
            indexColumn: PivotIndexColum;
            valuesColumns: ValuesColumn[];
            groupByColumns: GroupByColumn[] | undefined;
            sortBy: SortBy | undefined;
        };
    };

export type ExecuteAsyncUnderlyingDataRequestParams =
    CommonPaginatedQueryRequestParams & {
        underlyingDataSourceQueryUuid: string;
        underlyingDataItemId?: string;
        filters: Filters;
    };

type ExecuteAsyncDashboardSqlChartCommonParams =
    CommonPaginatedQueryRequestParams & {
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
    };

export type ExecuteAsyncDashboardSqlChartByUuidRequestParams =
    ExecuteAsyncDashboardSqlChartCommonParams & {
        savedSqlUuid: string;
    };

export type ExecuteAsyncDashboardSqlChartBySlugRequestParams =
    ExecuteAsyncDashboardSqlChartCommonParams & {
        slug: string;
    };

export type ExecuteAsyncDashboardSqlChartRequestParams =
    | ExecuteAsyncDashboardSqlChartByUuidRequestParams
    | ExecuteAsyncDashboardSqlChartBySlugRequestParams;

export const isExecuteAsyncDashboardSqlChartByUuidParams = (
    params: ExecuteAsyncDashboardSqlChartRequestParams,
): params is ExecuteAsyncDashboardSqlChartByUuidRequestParams =>
    'savedSqlUuid' in params;

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams
    | ExecuteAsyncUnderlyingDataRequestParams
    | ExecuteAsyncDashboardSqlChartRequestParams;
