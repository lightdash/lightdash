import {
    MetricQuery,
    type ItemsMap,
    type ResultsPaginationArgs,
} from '@lightdash/common';

export type PaginateMetricQueryArgs = ResultsPaginationArgs & {
    metricQuery: MetricQuery;
    csvLimit: number | null | undefined;
};

export type PaginateQueryIdArgs = ResultsPaginationArgs & {
    queryId: string;
    fields: ItemsMap;
    exploreName: string;
};

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
