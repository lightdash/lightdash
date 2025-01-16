import {
    type ApiError,
    type ApiGetMetricPeek,
    type ApiMetricsCatalog,
    type ApiSort,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type UseMetricsCatalogOptions = {
    projectUuid?: string;
    search?: string;
    categories?: string[];
    sortBy?: ApiSort['sort'] | 'name' | 'chartUsage';
    sortDirection?: ApiSort['order'];
};

export const MIN_METRICS_CATALOG_SEARCH_LENGTH = 2;

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
    const queryClient = useQueryClient();
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
        enabled:
            !!projectUuid &&
            (!!search
                ? search.length > MIN_METRICS_CATALOG_SEARCH_LENGTH
                : true),
        keepPreviousData: true,
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['metrics-tree', projectUuid],
            });
        },
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
    enabled = true,
}: UseMetricOptions & { enabled?: boolean }) => {
    return useQuery<ApiGetMetricPeek['results'], ApiError>({
        queryKey: ['metric', projectUuid, tableName, metricName],
        queryFn: () =>
            getMetric({
                projectUuid: projectUuid!,
                tableName: tableName!,
                metricName: metricName!,
            }),
        enabled: enabled && !!projectUuid && !!tableName && !!metricName,
    });
};

const hasMetricsInCatalog = async ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    return lightdashApi<boolean>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/has`,
        method: 'GET',
        body: undefined,
    });
};

export const useHasMetricsInCatalog = ({
    projectUuid,
}: {
    projectUuid: string | undefined;
}) => {
    return useQuery<boolean, ApiError>({
        queryKey: ['has-metrics', projectUuid],
        queryFn: () => hasMetricsInCatalog({ projectUuid: projectUuid! }),
        enabled: !!projectUuid,
    });
};
