import {
    Account,
    DownloadFileType,
    MetricQuery,
    PivotConfig,
    PivotConfiguration,
    type CacheMetadata,
    type DashboardFilters,
    type DateZoom,
    type DownloadAsyncQueryResultsPayload,
    type Filters,
    type ItemsMap,
    type ParametersValuesMap,
    type QueryExecutionContext,
    type ResultColumns,
    type ResultsPaginationArgs,
    type RunQueryTags,
    type SortField,
} from '@lightdash/common';

export type CommonAsyncQueryArgs = {
    account: Account;
    projectUuid: string;
    invalidateCache?: boolean;
    context: QueryExecutionContext;
    parameters?: ParametersValuesMap;
};

export type GetAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'context' | 'invalidateCache' | 'parameters'
> &
    ResultsPaginationArgs & {
        queryUuid: string;
    };

export type DownloadAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'invalidateCache' | 'context' | 'parameters'
> & {
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

export type ScheduleDownloadAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'invalidateCache' | 'context' | 'parameters'
> &
    Omit<DownloadAsyncQueryResultsPayload, 'userUuid' | 'organizationUuid'>;

export type ExecuteAsyncMetricQueryArgs = CommonAsyncQueryArgs & {
    metricQuery: MetricQuery;
    dateZoom?: DateZoom;
    pivotConfiguration?: PivotConfiguration;
};

export type ExecuteAsyncSavedChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    versionUuid?: string;
    limit?: number | null | undefined;
    pivotResults?: boolean;
};

export type ExecuteAsyncDashboardChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    tileUuid: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
    dateZoom?: DateZoom;
    limit?: number | null | undefined;
    pivotResults?: boolean;
};

export type ExecuteAsyncUnderlyingDataQueryArgs = CommonAsyncQueryArgs & {
    underlyingDataSourceQueryUuid: string;
    filters: Filters;
    underlyingDataItemId?: string;
    dateZoom?: DateZoom;
    limit?: number;
};

export type ExecuteAsyncQueryReturn = {
    queryUuid: string;
    cacheMetadata: CacheMetadata;
};

export type ExecuteAsyncSqlQueryArgs = CommonAsyncQueryArgs & {
    sql: string;
    limit?: number;
    pivotConfiguration?: PivotConfiguration;
};

export type ExecuteAsyncDashboardSqlChartCommonArgs = CommonAsyncQueryArgs & {
    dashboardUuid: string;
    tileUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
};

export type ExecuteAsyncDashboardSqlChartByUuidArgs =
    ExecuteAsyncDashboardSqlChartCommonArgs & {
        savedSqlUuid: string;
        limit?: number;
    };

export type ExecuteAsyncDashboardSqlChartBySlugArgs =
    ExecuteAsyncDashboardSqlChartCommonArgs & {
        slug: string;
        limit?: number;
    };

export type ExecuteAsyncDashboardSqlChartArgs =
    | ExecuteAsyncDashboardSqlChartByUuidArgs
    | ExecuteAsyncDashboardSqlChartBySlugArgs;

export const isExecuteAsyncDashboardSqlChartByUuid = (
    args: ExecuteAsyncDashboardSqlChartArgs,
): args is ExecuteAsyncDashboardSqlChartByUuidArgs => 'savedSqlUuid' in args;

export type ExecuteAsyncSqlChartByUuidArgs = CommonAsyncQueryArgs & {
    limit?: number;
    savedSqlUuid: string;
};

export type ExecuteAsyncSqlChartBySlugArgs = CommonAsyncQueryArgs & {
    limit?: number;
    slug: string;
};

export type ExecuteAsyncSqlChartArgs =
    | ExecuteAsyncSqlChartByUuidArgs
    | ExecuteAsyncSqlChartBySlugArgs;

export const isExecuteAsyncSqlChartByUuid = (
    args: ExecuteAsyncSqlChartArgs,
): args is ExecuteAsyncSqlChartByUuidArgs => 'savedSqlUuid' in args;

export type RunAsyncWarehouseQueryArgs = {
    userId: string;
    // Is the user in the database?
    isRegisteredUser: boolean;
    projectUuid: string;
    queryTags: RunQueryTags;
    query: string;
    fieldsMap: ItemsMap;
    queryHistoryUuid: string;
    cacheKey: string;
    warehouseCredentialsOverrides?: {
        snowflakeVirtualWarehouse?: string;
        databricksCompute?: string;
    };
    pivotConfiguration?: PivotConfiguration;
    originalColumns?: ResultColumns;
    /**
     * Set of metric field IDs that have period-over-period comparison enabled.
     * Used to add popMetadata to the corresponding ResultColumns.
     */
    popEnabledMetrics?: Set<string>;
};
