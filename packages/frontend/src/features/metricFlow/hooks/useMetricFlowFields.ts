import { ApiError } from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import uniqWith from 'lodash/uniqWith';
import {
    getMetricFlowFields,
    GetMetricFlowFieldsResponse,
    TimeGranularity,
} from '../../../api/MetricFlowAPI';

const useMetricFlowFields = (
    projectUuid?: string,
    selectedFields?: {
        metrics: Record<string, {}>;
        dimensions: Record<string, { grain: TimeGranularity }>;
    },
    useQueryOptions?: UseQueryOptions<GetMetricFlowFieldsResponse, ApiError>,
) => {
    return useQuery<GetMetricFlowFieldsResponse, ApiError>({
        queryKey: ['metric_flow_fields', projectUuid, selectedFields],
        enabled: !!projectUuid,
        queryFn: () => getMetricFlowFields(projectUuid!, selectedFields),
        keepPreviousData: true,
        select: (data) => {
            // If no dimensions are returned, use the dimensions from the metrics
            if (
                !selectedFields ||
                Object.keys(selectedFields.metrics).length === 0
            ) {
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

export default useMetricFlowFields;
