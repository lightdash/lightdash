import { type ParametersValuesMap, type PivotConfiguration } from '../..';
import type { QueryExecutionContext } from '../analytics';
import type { ConditionalFormattingConfig } from '../conditionalFormatting';
import type { DownloadFileType } from '../downloadFile';
import type { AndFilterGroup, DashboardFilters, Filters } from '../filter';
import { type MergeQuery, type MetricSourcedMergeQuery } from '../mergeQuery';
import type { MetricQueryRequest, SortField } from '../metricQuery';
import type { PivotConfig } from '../pivot';
import type { DateGranularity } from '../timeFrames';
import type { UUID } from './uuid';

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

/** A merge run: the spec that produced it, recorded verbatim. */
export type ExecuteAsyncMergeQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        /**
         * Warehouse-side merges are metric-sourced by construction, so this
         * member keeps the strict shape it always had; merges that reference
         * existing results record as ExecuteAsyncComposeMergeQueryRequestParams
         * instead (expand-only: the echo in query history only gains branches).
         */
        mergeQuery: MetricSourcedMergeQuery;
        pivotConfiguration?: PivotConfiguration;
    };

/** A compose-engine merge run, which may reference existing results. */
export type ExecuteAsyncComposeMergeQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        mergeQuery: MergeQuery;
        pivotConfiguration?: PivotConfiguration;
    };

export type ExecuteAsyncSqlQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        sql: string;
        limit?: number;
        pivotConfiguration?: PivotConfiguration;
    };

export type ExecuteAsyncComposeSqlQueryRequestParams =
    CommonExecuteQueryRequestParams & {
        sql: string;
        limit?: number;
        /**
         * Results of other async queries exposed to the SQL as tables,
         * keyed by table name: {"orders": "<queryUuid>"} lets the SQL run
         * SELECT * FROM orders. Each referenced query is authorized with the
         * same access checks as fetching its results by uuid; references to
         * still-running queries are waited on before this query executes.
         *
         * Typed Record<string, UUID> (not Record<string, string>) on purpose:
         * TSOA compiles a string-valued record to an empty object literal and
         * validation then strips every key; a ref-aliased value type keeps
         * additionalProperties intact (and validates the uuid format).
         */
        references?: Record<string, UUID>;
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
    showColumnTotals?: boolean;
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
    | ExecuteAsyncMergeQueryRequestParams
    | ExecuteAsyncComposeMergeQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncComposeSqlQueryRequestParams
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
