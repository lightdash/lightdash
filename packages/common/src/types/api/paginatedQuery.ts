import { type ParametersValuesMap, type PivotConfiguration } from '../..';
import type { QueryExecutionContext } from '../analytics';
import type { DownloadFileType } from '../downloadFile';
import type { DashboardFilters, Filters } from '../filter';
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
    };

export type ExecuteAsyncSavedChartRequestParams =
    CommonExecuteQueryRequestParams & {
        chartUuid: string;
        versionUuid?: string;
        limit?: number | null | undefined;
        pivotResults?: boolean;
    };

export type DrillStep = {
    /** ID of the drill path from the chart's drillConfig */
    drillPathId: string;
    /** Raw dimension values from the clicked row, keyed by field ID */
    drillDimensionValues: Record<string, unknown>;
    /** For linked chart drill-through: UUID of the target chart */
    linkedChartUuid?: string;
    /** Inline drill path data (used when drillConfig isn't saved yet) */
    inlineDimensions?: string[];
    inlineMetrics?: string[];
    inlineSorts?: Array<{ fieldId: string; descending: boolean }>;
};

export type ExecuteAsyncSavedChartDrillRequestParams =
    CommonExecuteQueryRequestParams & {
        /** Source chart UUID. Optional for drill-through (unsaved charts can drill to linked charts). */
        chartUuid?: string;
        /** Ordered list of drill steps to apply (supports multi-level drill) */
        drillSteps: DrillStep[];
        /** Optional dashboard context for drills initiated from dashboard tiles */
        dashboardFilters?: DashboardFilters;
        dashboardSorts?: SortField[];
        dateZoom?: DateZoom;
        limit?: number | null | undefined;
        pivotResults?: boolean;
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
    attachmentDownloadName?: string;
};

export type ExecuteAsyncQueryRequestParams =
    | ExecuteAsyncMetricQueryRequestParams
    | ExecuteAsyncSqlQueryRequestParams
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncSavedChartDrillRequestParams
    | ExecuteAsyncDashboardChartRequestParams
    | ExecuteAsyncUnderlyingDataRequestParams
    | ExecuteAsyncDashboardSqlChartRequestParams;
