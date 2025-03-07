import {
    MetricQuery,
    type DateGranularity,
    type ItemsMap,
    type QueryExecutionContext,
    type ResultsPaginationArgs,
} from '@lightdash/common';

export type PaginateMetricQueryArgs = ResultsPaginationArgs & {
    metricQuery: MetricQuery;
    csvLimit: number | null | undefined;
    dateZoomGranularity?: DateGranularity;
    context?: QueryExecutionContext;
};

export type PaginateQueryIdArgs = ResultsPaginationArgs & {
    queryId: string;
    fields: ItemsMap;
    exploreName: string;
    dateZoomGranularity?: DateGranularity;
    context?: QueryExecutionContext;
};

export type PaginateSavedChartArgs = ResultsPaginationArgs & {
    chartUuid: string;
    versionUuid?: string;
    context?: QueryExecutionContext;
};

// TODO: Not including PaginateSavedChartArgs since it is the same as PaginateMetricQueryArgs after we get the chart from the db, in the future, this function will only take PaginateMetricQueryArgs, first we need queryId metadata
export type PaginateQueryArgs = (
    | PaginateMetricQueryArgs
    | PaginateQueryIdArgs
) & {
    invalidateCache?: boolean;
};

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
