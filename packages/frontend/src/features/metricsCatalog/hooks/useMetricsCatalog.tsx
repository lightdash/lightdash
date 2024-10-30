import {
    type ApiError,
    type ApiMetricsCatalog,
    type ApiSort,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type UseMetricsCatalogOptions = {
    projectUuid?: string;
    search?: string;
    sortBy?: ApiSort['sort'];
    sortDirection?: ApiSort['order'];
};

const getMetricsCatalog = async ({
    projectUuid,
    search,
    paginateArgs,
    sortBy,
    sortDirection,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
} & Pick<UseMetricsCatalogOptions, 'search' | 'sortBy' | 'sortDirection'>) => {
    const urlParams = new URLSearchParams({
        ...(paginateArgs
            ? {
                  page: String(paginateArgs.page),
                  pageSize: String(paginateArgs.pageSize),
              }
            : {}),
        ...(search ? { search } : {}),
        ...(sortBy ? { sort: sortBy } : {}),
        ...(sortDirection ? { order: sortDirection } : {}),
    }).toString();

    return lightdashApi<ApiMetricsCatalog['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics${
            urlParams ? `?${urlParams}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsCatalog = ({
    projectUuid,
    search,
    sortBy,
    sortDirection,
    pageSize,
}: UseMetricsCatalogOptions & Pick<KnexPaginateArgs, 'pageSize'>) => {
    return useInfiniteQuery<ApiMetricsCatalog['results'], ApiError>({
        queryKey: [
            'metrics-catalog',
            projectUuid,
            pageSize,
            search,
            sortBy,
            sortDirection,
        ],
        queryFn: ({ pageParam }) =>
            getMetricsCatalog({
                projectUuid: projectUuid!,
                search,
                sortBy,
                sortDirection,
                paginateArgs: {
                    page: pageParam ?? 1,
                    pageSize,
                },
            }),
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        enabled: !!projectUuid && (!!search ? search.length > 2 : true),
        keepPreviousData: true,
    });
};
