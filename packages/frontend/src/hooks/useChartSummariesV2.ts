import {
    ContentType,
    type ApiChartContentResponse,
    type ApiError,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';

type UseChartSummariesV2Args = {
    projectUuid: string | undefined;
    pageSize: number;
    page: number;
    search?: string;
};

const getChartSummariesInProjectV2 = async ({
    projectUuid,
    page,
    pageSize,
    search,
}: UseChartSummariesV2Args) => {
    return lightdashApi<ApiChartContentResponse['results']>({
        version: 'v2',
        url: `/content?projectUuids=${projectUuid}&contentTypes=${ContentType.CHART}&pageSize=${pageSize}&page=${page}&search=${search}`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummariesV2 = (
    args: UseChartSummariesV2Args,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiChartContentResponse['results'],
        ApiError
    > = {},
) => {
    return useInfiniteQuery<ApiChartContentResponse['results'], ApiError>({
        queryKey: ['project', 'chart-summaries-v2', args],
        queryFn: async ({ pageParam }) => {
            return getChartSummariesInProjectV2({
                ...args,
                page: pageParam ?? 1,
            });
        },
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });
};
