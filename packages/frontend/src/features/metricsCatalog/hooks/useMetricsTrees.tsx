import type {
    ApiError,
    ApiGetMetricsTreeResponse,
    ApiGetMetricsTreesResponse,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getMetricsTrees = async (projectUuid: string) => {
    return lightdashApi<ApiGetMetricsTreesResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsTrees = (
    projectUuid: string | undefined,
    options?: UseQueryOptions<ApiGetMetricsTreesResponse['results'], ApiError>,
) => {
    return useQuery<ApiGetMetricsTreesResponse['results'], ApiError>({
        queryKey: ['metrics-trees', projectUuid],
        queryFn: () => getMetricsTrees(projectUuid!),
        enabled: !!projectUuid,
        staleTime: 1000 * 60 * 5,
        ...options,
    });
};

const getMetricsTreeDetails = async (
    projectUuid: string,
    metricsTreeUuid: string,
) => {
    return lightdashApi<ApiGetMetricsTreeResponse['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/trees/${metricsTreeUuid}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricsTreeDetails = (
    projectUuid: string | undefined,
    metricsTreeUuid: string | null,
) => {
    return useQuery<ApiGetMetricsTreeResponse['results'], ApiError>({
        queryKey: ['metrics-tree-details', projectUuid, metricsTreeUuid],
        queryFn: () => getMetricsTreeDetails(projectUuid!, metricsTreeUuid!),
        enabled: !!projectUuid && !!metricsTreeUuid,
    });
};
