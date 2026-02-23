import {
    type ApiError,
    type ApiGetPreAggregateStatsResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getPreAggregateStats = async (
    projectUuid: string,
    days: number,
    paginateArgs?: KnexPaginateArgs,
) =>
    lightdashApi<ApiGetPreAggregateStatsResponse['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/pre-aggregate-stats?days=${days}${
            paginateArgs
                ? `&page=${paginateArgs.page}&pageSize=${paginateArgs.pageSize}`
                : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const usePreAggregateStats = (
    projectUuid: string,
    days: number = 3,
    pageSize: number = 100,
) => {
    return useInfiniteQuery<
        ApiGetPreAggregateStatsResponse['results'],
        ApiError
    >({
        queryKey: ['preAggregateStats', projectUuid, days, pageSize],
        queryFn: ({ pageParam }) =>
            getPreAggregateStats(projectUuid, days, {
                page: (pageParam as number) ?? 1,
                pageSize,
            }),
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
            return undefined;
        },
        enabled: !!projectUuid,
    });
};
