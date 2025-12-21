import { type ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import uniqWith from 'lodash/uniqWith';
import {
    getSemanticLayerDimensions,
    type GetMetricFlowFieldsResponse,
} from '../../../api/MetricFlowAPI';

const useSemanticLayerDimensions = (
    projectUuid?: string,
    metrics?: Record<string, {}>,
    useQueryOptions?: UseQueryOptions<GetMetricFlowFieldsResponse, ApiError>,
) => {
    return useQuery<GetMetricFlowFieldsResponse, ApiError>({
        queryKey: ['semantic_layer_dimensions', projectUuid, metrics],
        enabled: !!projectUuid,
        queryFn: () => getSemanticLayerDimensions(projectUuid!, metrics || {}),
        keepPreviousData: true,
        select: (data) => {
            // If no dimensions are returned, use the dimensions from the metrics
            if (!metrics || Object.keys(metrics).length === 0) {
                const dimensionsFromMetrics = uniqWith(
                    data.metricsForDimensions
                        .map((metric) => metric.dimensions)
                        .flat(),
                    (a, b) => a.name === b.name,
                );
                return {
                    ...data,
                    dimensions: dimensionsFromMetrics,
                };
            }
            return data;
        },
        ...useQueryOptions,
    });
};

export default useSemanticLayerDimensions;
