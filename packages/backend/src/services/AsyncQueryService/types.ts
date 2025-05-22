import {
    GroupByColumn,
    ItemsMap,
    MetricQuery,
    SortBy,
    ValuesColumn,
    type CacheMetadata,
    type DashboardFilters,
    type DateGranularity,
    type DateZoom,
    type Filters,
    type PivotIndexColum,
    type QueryExecutionContext,
    type ResultsPaginationArgs,
    type SessionUser,
    type SortField,
} from '@lightdash/common';

export type CommonAsyncQueryArgs = {
    user: SessionUser;
    projectUuid: string;
    invalidateCache?: boolean;
    context: QueryExecutionContext;
};

export type GetAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'context' | 'invalidateCache'
> &
    ResultsPaginationArgs & {
        queryUuid: string;
    };

export type DownloadAsyncQueryResultsArgs = Omit<
    CommonAsyncQueryArgs,
    'invalidateCache' | 'context'
> & {
    queryUuid: string;
};

export type ExecuteAsyncMetricQueryArgs = CommonAsyncQueryArgs & {
    metricQuery: MetricQuery;
    dateZoom?: DateZoom;
};

export type ExecuteAsyncSavedChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    versionUuid?: string;
};

export type ExecuteAsyncDashboardChartQueryArgs = CommonAsyncQueryArgs & {
    chartUuid: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
    dateZoom?: DateZoom;
};

export type ExecuteAsyncUnderlyingDataQueryArgs = CommonAsyncQueryArgs & {
    underlyingDataSourceQueryUuid: string;
    filters: Filters;
    underlyingDataItemId?: string;
    dateZoom?: DateZoom;
};

export type ExecuteAsyncQueryReturn = {
    queryUuid: string;
    cacheMetadata: CacheMetadata;
};

export type ExecuteAsyncSqlQueryArgs = CommonAsyncQueryArgs & {
    sql: string;
    limit?: number;
    pivotConfiguration?: {
        indexColumn: PivotIndexColum;
        valuesColumns: ValuesColumn[];
        groupByColumns: GroupByColumn[] | undefined;
        sortBy: SortBy | undefined;
    };
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
