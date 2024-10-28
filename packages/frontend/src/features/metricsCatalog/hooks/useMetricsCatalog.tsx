import { type ApiMetricsCatalogResults } from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type UseMetricsCatalogOptions = {
    projectUuid: string;
    search?: string;
    pageSize?: number;
    enabled?: boolean;
};

const DEFAULT_PAGE_SIZE = 25;

const getMetricsCatalog = async ({
    projectUuid,
}: // search,
// pageParam = 0, // Changed from page to pageParam
// pageSize,
UseMetricsCatalogOptions & { pageParam?: number }) =>
    lightdashApi<ApiMetricsCatalogResults>({
        method: 'GET',
        url: `/projects/${projectUuid}/dataCatalog/metrics`,
        body: undefined,
        // TODO: Add query parameters for pagination
        // params: {
        //     offset: pageParam * pageSize,
        //     limit: pageSize,
        //     search
        // }
    });

export const useMetricsCatalog = ({
    projectUuid,
    search,
    pageSize = DEFAULT_PAGE_SIZE,
    enabled = true,
}: UseMetricsCatalogOptions) => {
    return useInfiniteQuery({
        queryKey: ['metrics-catalog', projectUuid, search, pageSize],
        queryFn: ({ pageParam }) =>
            getMetricsCatalog({ projectUuid, search, pageSize, pageParam }),
        getNextPageParam: (_lastPage, allPages) => {
            // TODO: Implement proper next page calculation based on API response
            return allPages.length;
        },
        enabled: enabled && !!projectUuid,
    });
};
