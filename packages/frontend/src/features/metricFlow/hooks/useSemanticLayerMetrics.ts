import { ApiError } from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import {
    getSemanticLayerMetrics,
    GetSemanticLayerMetricsResponse,
    TimeGranularity,
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
