import {
    Account,
    DownloadFileType,
    MetricQuery,
    PivotConfig,
    PivotConfiguration,
    type AndFilterGroup,
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
    type UserAccessControls,
    type UserAttributeValueMap,
} from '@lightdash/common';

export type CommonAsyncQueryArgs = {
    account: Account;
    projectUuid: string;
    invalidateCache?: boolean;
    usePreAggregateCache?: boolean;
    context: QueryExecutionContext;
    parameters?: ParametersValuesMap;
    userAttributeOverrides?: UserAttributeValueMap;
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
    exportPivotedData?: boolean;
    attachmentDownloadName?: string;
    expirationSecondsOverride?: number;
};

export type ScheduleDownloadAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'invalidateCache' | 'context' | 'parameters'
> &
    Omit<DownloadAsyncQueryResultsPayload, 'userUuid' | 'organizationUuid'>;

export type ExecuteAsyncFieldValueSearchArgs = CommonAsyncQueryArgs & {
    table: string;
    fieldId: string;
    search: string;
    limit?: number;
    filters?: AndFilterGroup;
    forceRefresh?: boolean;
};

export type ExecuteAsyncMetricQueryArgs = CommonAsyncQueryArgs & {
    metricQuery: MetricQuery;
    dateZoom?: DateZoom;
    pivotConfiguration?: PivotConfiguration;
    materializationRole?: UserAccessControls;
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
    limit?: number | null;
    sorts?: SortField[];
};

export type ExecuteAsyncQueryReturn = {
    queryUuid: string;
    cacheMetadata: CacheMetadata;
};

export type PreAggregationRouteMode = 'required' | 'opportunistic';

export type PreAggregationRoute = {
    sourceExploreName: string;
    preAggregateName: string;
    mode: PreAggregationRouteMode;
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

export type PollingOptions = {
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    timeoutMs?: number;
};

/**
 * Polling options tuned for scheduled/background tasks (e.g. GSheet syncs, email deliveries).
 * Slower polling reduces DB round-trips through cloud-sql-proxy, preventing OOM under load.
 */
export const SCHEDULER_POLLING_OPTIONS: PollingOptions = {
    initialBackoffMs: 2000,
    maxBackoffMs: 5000,
};

export type RunAsyncWarehouseQueryArgs = {
    projectUuid: string;
    userUuid: string;
    organizationUuid: string;
    queryUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount?: boolean;
    queryTags: RunQueryTags;
    fieldsMap: ItemsMap;
    cacheKey: string;
    warehouseCredentialsOverrides?: {
        snowflakeVirtualWarehouse?: string;
        databricksCompute?: string;
    };
    pivotConfiguration?: PivotConfiguration;
    originalColumns?: ResultColumns;
    query: string;
    queryCreatedAt: Date;
    displayTimezone: string | null;
};

export type RunAsyncPreAggregateQueryArgs = Omit<
    RunAsyncWarehouseQueryArgs,
    'query'
> & {
    preAggregateQuery: string;
    warehouseQuery: string;
};
