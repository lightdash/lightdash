import {
    type ApiError,
    type ApiProjectQueryHistoryResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getProjectQueryHistory = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
): Promise<ApiProjectQueryHistoryResponse['results']> => {
    const params = new URLSearchParams({
        page: paginateArgs.page.toString(),
        pageSize: paginateArgs.pageSize.toString(),
    });

    return lightdashApi<ApiProjectQueryHistoryResponse['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/query-history?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useProjectQueryHistory = ({
    projectUuid,
    paginateArgs,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
}): UseInfiniteQueryResult<
    ApiProjectQueryHistoryResponse['results'],
    ApiError
> =>
    useInfiniteQuery<ApiProjectQueryHistoryResponse['results'], ApiError>({
        queryKey: ['projectQueryHistory', projectUuid, paginateArgs],
        queryFn: async ({ pageParam = 0 }) =>
            getProjectQueryHistory(projectUuid, {
                page: (pageParam as number) + 1,
                pageSize: paginateArgs?.pageSize || 10,
            }),
        getNextPageParam: (lastPage, pages) => {
            const totalPages = lastPage.pagination?.totalPageCount ?? 0;
            return pages.length < totalPages ? pages.length : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!projectUuid,
    });
