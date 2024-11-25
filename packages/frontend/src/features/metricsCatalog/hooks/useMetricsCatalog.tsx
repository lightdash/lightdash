import {
    type ApiError,
    type ApiGetMetricPeek,
    type ApiMetricsCatalog,
    type ApiSort,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type UseMetricsCatalogOptions = {
    projectUuid?: string;
    search?: string;
    categories?: string[];
    sortBy?: ApiSort['sort'] | 'name' | 'chartUsage';
    sortDirection?: ApiSort['order'];
};

const getMetricsCatalog = async ({
    projectUuid,
    search,
    categories,
    paginateArgs,
    sortBy,
    sortDirection,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
} & Pick<
    UseMetricsCatalogOptions,
    'search' | 'categories' | 'sortBy' | 'sortDirection'
>) => {
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
    });

    if (categories && categories.length > 0) {
        categories.forEach((category) =>
            urlParams.append('categories', category),
        );
    }

    return lightdashApi<ApiMetricsCatalog['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics${
            urlParams.toString() ? `?${urlParams.toString()}` : ''
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
    categories,
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
            categories,
        ],
        queryFn: ({ pageParam }) =>
            getMetricsCatalog({
                projectUuid: projectUuid!,
                search,
                sortBy,
                sortDirection,
                categories,
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

type UseMetricOptions = {
    projectUuid: string | undefined;
    tableName: string | undefined;
    metricName: string | undefined;
};

const getMetric = async ({
    projectUuid,
    tableName,
    metricName,
}: {
    projectUuid: string;
    tableName: string;
    metricName: string;
}) => {
    return lightdashApi<ApiGetMetricPeek['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/${tableName}/${metricName}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetric = ({
    projectUuid,
    tableName,
    metricName,
}: UseMetricOptions) => {
    return useQuery<ApiGetMetricPeek['results'], ApiError>({
        queryKey: ['metric', projectUuid, tableName, metricName],
        queryFn: () =>
            getMetric({
                projectUuid: projectUuid!,
                tableName: tableName!,
                metricName: metricName!,
            }),
        enabled: !!projectUuid && !!tableName && !!metricName,
    });
};
