import type { ApiError, ApiGetAllMetricsTreeEdges } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getAllMetricsTreeEdges = async (projectUuid: string | undefined) => {
    return lightdashApi<ApiGetAllMetricsTreeEdges['results']>({
        url: `/projects/${projectUuid}/dataCatalog/metrics/tree/edges`,
        method: 'GET',
        body: undefined,
    });
};

export const useAllMetricsTreeEdges = (
    projectUuid: string | undefined,
    options?: UseQueryOptions<ApiGetAllMetricsTreeEdges['results'], ApiError>,
) => {
    return useQuery<ApiGetAllMetricsTreeEdges['results'], ApiError>({
        queryKey: ['all-metrics-tree-edges', projectUuid],
        queryFn: () => getAllMetricsTreeEdges(projectUuid),
        enabled: !!projectUuid,
        staleTime: 1000 * 60 * 5, // 5 minutes - edges don't change often
        ...options,
    });
};
