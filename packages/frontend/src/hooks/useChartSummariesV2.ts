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
    spaceUuid?: string;
    pageSize: number;
    page: number;
    search?: string;
};

const getChartSummariesInProjectV2 = async ({
    projectUuid,
    spaceUuid,
    page,
    pageSize,
    search,
}: UseChartSummariesV2Args) => {
    const searchParams = new URLSearchParams({
        projectUuids: projectUuid ?? '',
        contentTypes: ContentType.CHART,
        pageSize: pageSize.toString(),
        page: page.toString(),
        search: search ?? '',
    });

    if (spaceUuid) {
        searchParams.set('spaceUuids', spaceUuid);
    }

    return lightdashApi<ApiChartContentResponse['results']>({
        version: 'v2',
        url: `/content?${searchParams.toString()}`,
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
