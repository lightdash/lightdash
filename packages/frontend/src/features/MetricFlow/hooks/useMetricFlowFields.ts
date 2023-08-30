import { ApiError } from '@lightdash/common';
import { uniqWith } from 'lodash-es';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import {
    getMetricFlowFields,
    GetMetricFlowFieldsResponse,
} from '../../../api/MetricFlowAPI';

const useMetricFlowFields = (
    projectUuid?: string,
    filters?: {
        metrics: string[];
        dimensions: string[];
    },
    useQueryOptions?: UseQueryOptions<GetMetricFlowFieldsResponse, ApiError>,
) => {
    return useQuery<GetMetricFlowFieldsResponse, ApiError>({
        queryKey: ['metric_flow_fields', projectUuid, filters],
        enabled: !!projectUuid,
        queryFn: () => getMetricFlowFields(projectUuid!, filters),
        keepPreviousData: true,
        select: (data) => {
            // If no dimensions are returned, use the dimensions from the metrics
            if (!filters || filters.metrics.length === 0) {
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
