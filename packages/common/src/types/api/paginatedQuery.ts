import {
    type GroupByColumn,
    type PivotIndexColum,
    type SortBy,
    type ValuesColumn,
} from '../..';

import type { QueryExecutionContext } from '../analytics';
import type { DownloadFileType } from '../downloadFile';
import type { DashboardFilters, Filters } from '../filter';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { PivotConfig } from '../pivot';
import type { DateGranularity } from '../timeFrames';

type CommonPaginatedQueryRequestParams = {
    context?: QueryExecutionContext;
    invalidateCache?: boolean;
};

export type DateZoom = {
    granularity?: DateGranularity;
    xAxisFieldId?: string;
};

export type ExecuteAsyncMetricQueryRequestParams =
    CommonPaginatedQueryRequestParams & {
        query: Omit<MetricQueryRequest, 'csvLimit'>;
        dateZoom?: DateZoom;
    };

export type ExecuteAsyncSavedChartRequestParams =
    CommonPaginatedQueryRequestParams & {
        chartUuid: string;
        versionUuid?: string;
        limit?: number | null | undefined;
    };

export type ExecuteAsyncDashboardChartRequestParams =
    CommonPaginatedQueryRequestParams & {
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        dateZoom?: DateZoom;
        limit?: number | null | undefined;
    };

export type ExecuteAsyncSqlQueryRequestParams =
    CommonPaginatedQueryRequestParams & {
        sql: string;
        limit?: number;
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
        dateZoom?: DateZoom;
    };

export type ExecuteAsyncSqlChartByUuidRequestParams =
    CommonPaginatedQueryRequestParams & {
        savedSqlUuid: string;
        limit?: number;
    };

export type ExecuteAsyncSqlChartBySlugRequestParams =
    CommonPaginatedQueryRequestParams & {
        slug: string;
        limit?: number;
    };

export type ExecuteAsyncSqlChartRequestParams =
    | ExecuteAsyncSqlChartByUuidRequestParams
    | ExecuteAsyncSqlChartBySlugRequestParams;

export const isExecuteAsyncSqlChartByUuidParams = (
    params: ExecuteAsyncSqlChartRequestParams,
): params is ExecuteAsyncSqlChartByUuidRequestParams =>
    'savedSqlUuid' in params;

type ExecuteAsyncDashboardSqlChartCommonParams =
    CommonPaginatedQueryRequestParams & {
        dashboardUuid: string;
        tileUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        limit?: number;
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

export type DownloadAsyncQueryResultsRequestParams = {
    queryUuid: string;
    type?: DownloadFileType;
    onlyRaw?: boolean;
    showTableNames?: boolean;
    customLabels?: Record<string, string>;
    columnOrder?: string[];
    hiddenFields?: string[];
    pivotConfig?: PivotConfig;
    attachmentDownloadName?: string;
};

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams
    | ExecuteAsyncUnderlyingDataRequestParams
    | ExecuteAsyncDashboardSqlChartRequestParams;
