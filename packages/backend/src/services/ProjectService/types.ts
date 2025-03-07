import {
    MetricQuery,
    type DashboardFilters,
    type DateGranularity,
    type ItemsMap,
    type QueryExecutionContext,
    type ResultsPaginationArgs,
    type SessionUser,
    type SortField,
} from '@lightdash/common';

export type CommonPaginateArgs = ResultsPaginationArgs & {
    user: SessionUser;
    projectUuid: string;
    invalidateCache?: boolean;
    context?: QueryExecutionContext;
};

export type PaginateMetricQueryArgs = CommonPaginateArgs & {
    metricQuery: MetricQuery;
    csvLimit: number | null | undefined;
    dateZoomGranularity?: DateGranularity;
};

export type PaginateQueryIdArgs = CommonPaginateArgs & {
    queryId: string;
    fields: ItemsMap;
    exploreName: string;
    dateZoomGranularity?: DateGranularity;
};

export type PaginateSavedChartArgs = CommonPaginateArgs & {
    chartUuid: string;
    versionUuid?: string;
};

export type PaginateDashboardChartArgs = CommonPaginateArgs & {
    chartUuid: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    dashboardSorts: SortField[];
    granularity?: DateGranularity;
    autoRefresh?: boolean;
};

// TODO: Not including PaginateSavedChartArgs since it is the same as PaginateMetricQueryArgs after we get the chart from the db, in the future, this function will only take PaginateMetricQueryArgs, first we need queryId metadata
export type PaginateQueryArgs = PaginateMetricQueryArgs | PaginateQueryIdArgs;

export function isPaginateQueryIdArgs(
    args: PaginateQueryArgs,
): args is PaginateQueryIdArgs {
    return 'queryId' in args && 'fields' in args && 'exploreName' in args;
}

export function isPaginateMetricQueryArgs(
    args: PaginateQueryArgs,
): args is PaginateMetricQueryArgs {
    return 'metricQuery' in args && 'csvLimit' in args;
}
