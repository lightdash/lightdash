import {
    type ApiError,
    type ApiGetPreAggregateMaterializationsResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getPreAggregateMaterializations = async (
    projectUuid: string,
    paginateArgs?: KnexPaginateArgs,
) =>
    lightdashApi<ApiGetPreAggregateMaterializationsResponse['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/pre-aggregates/materializations${
            paginateArgs
                ? `?page=${paginateArgs.page}&pageSize=${paginateArgs.pageSize}`
                : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const usePreAggregateMaterializations = (
    projectUuid: string,
    pageSize: number = 50,
) => {
    return useInfiniteQuery<
        ApiGetPreAggregateMaterializationsResponse['results'],
        ApiError
    >({
        queryKey: ['preAggregateMaterializations', projectUuid, pageSize],
        queryFn: ({ pageParam }) =>
            getPreAggregateMaterializations(projectUuid, {
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
