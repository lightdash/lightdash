import { type ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
    getSemanticLayerMetrics,
    type GetSemanticLayerMetricsResponse,
    type TimeGranularity,
} from '../../../api/MetricFlowAPI';

const useSemanticLayerMetrics = (
    projectUuid?: string,
    dimensions?: Record<string, { grain: TimeGranularity }>,
    useQueryOptions?: UseQueryOptions<
        GetSemanticLayerMetricsResponse,
        ApiError
    >,
) => {
    return useQuery<GetSemanticLayerMetricsResponse, ApiError>({
        queryKey: ['semantic_layer_metrics', projectUuid, dimensions],
        enabled: !!projectUuid,
        queryFn: () => getSemanticLayerMetrics(projectUuid!, dimensions || {}),
        keepPreviousData: true,
        ...useQueryOptions,
    });
};

export default useSemanticLayerMetrics;
