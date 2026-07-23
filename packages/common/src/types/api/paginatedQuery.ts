import { type ParametersValuesMap, type PivotConfiguration } from '../..';
import type { QueryExecutionContext } from '../analytics';
import type { ConditionalFormattingConfig } from '../conditionalFormatting';
import type { DownloadFileType } from '../downloadFile';
import type { AndFilterGroup, DashboardFilters, Filters } from '../filter';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { PivotConfig } from '../pivot';
import type { DateGranularity } from '../timeFrames';

type CommonExecuteQueryRequestParams = {
    context?: QueryExecutionContext;
    invalidateCache?: boolean;
    usePreAggregateCache?: boolean;
    parameters?: ParametersValuesMap;
};

export type DateZoom = {
    granularity?: DateGranularity | string;
    xAxisFieldId?: string;
};

export type ExecuteAsyncMetricQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        query: Omit<MetricQueryRequest, 'csvLimit'>;
        dateZoom?: DateZoom;
        pivotConfiguration?: PivotConfiguration;
        // Filters whose target field is absent from the query's explore are
        // dropped silently — an app may run queries against multiple explores
        // and one mismatch shouldn't break the others.
        dashboardFilters?: DashboardFilters;
    };

export type ExecuteAsyncSavedChartRequestParams =
    CommonExecuteQueryRequestParams & {
        chartUuid: string;
        versionUuid?: string;
        limit?: number | null | undefined;
        pivotResults?: boolean;
        // ANDed onto the chart's own filters server-side (narrowing only).
        filters?: Filters;
        // Filters whose target field is absent from the chart's explore are
        // dropped silently — a dashboard hosting a data-app tile filters
        // across explores and one mismatch shouldn't break the linked chart.
        dashboardFilters?: DashboardFilters;
    };

export type ExecuteAsyncDashboardChartRequestParams =
    CommonExecuteQueryRequestParams & {
        chartUuid: string;
        tileUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        dashboardSorts: SortField[];
        dateZoom?: DateZoom;
        limit?: number | null | undefined;
        pivotResults?: boolean;
    };

export type ExecuteAsyncSqlQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        sql: string;
        limit?: number;
        pivotConfiguration?: PivotConfiguration;
    };

export type ExecuteAsyncUnderlyingDataRequestParams =
    CommonExecuteQueryRequestParams & {
        underlyingDataSourceQueryUuid: string;
        underlyingDataItemId?: string;
        filters: Filters;
        dateZoom?: DateZoom;
        limit?: number | null;
        sorts?: SortField[];
    };

export type ExecuteAsyncSqlChartByUuidRequestParams =
    CommonExecuteQueryRequestParams & {
        savedSqlUuid: string;
        limit?: number;
    };

export type ExecuteAsyncSqlChartBySlugRequestParams =
    CommonExecuteQueryRequestParams & {
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
    CommonExecuteQueryRequestParams & {
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
    exportPivotedData?: boolean;
    attachmentDownloadName?: string;
    conditionalFormattings?: ConditionalFormattingConfig[];
};

export type ExecuteAsyncFieldValueSearchRequestParams =
    CommonExecuteQueryRequestParams & {
        table: string;
        fieldId: string;
        search: string;
        limit?: number;
        filters?: AndFilterGroup;
        forceRefresh?: boolean;
    };

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams
    | ExecuteAsyncUnderlyingDataRequestParams
    | ExecuteAsyncDashboardSqlChartRequestParams
    | ExecuteAsyncFieldValueSearchRequestParams;

// Recovers dateZoom from a persisted request-parameters union without duck-typing at call sites.
export const getDateZoomFromRequestParameters = (
    params: ExecuteAsyncQueryRequestParams | undefined,
): DateZoom | undefined =>
    params && 'dateZoom' in params ? params.dateZoom : undefined;

/**
 * Kinds of totals derivable from an executed pivot query.
 */
export type CalculateTotalKind =
    | 'grandTotal'
    | 'columnTotal'
    | 'rowTotal'
    | 'columnSubtotal'
    | 'rowSubtotal';

export type ExecuteAsyncCalculateTotalRequestParams = {
    kind: CalculateTotalKind;
    // Required for subtotal kinds: the dimensions this subtotal level groups
    // by. Column subtotals also add the pivot groupBy columns.
    subtotalDimensions?: string[];
    invalidateCache?: boolean;
};
