import { type ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
    getMetricDefinition,
    type MetricDefinition,
} from '../../../api/MetricFlowAPI';

const useMetricDefinition = (
    projectUuid?: string,
    metricName?: string,
    useQueryOptions?: UseQueryOptions<MetricDefinition | null, ApiError>,
) => {
    return useQuery<MetricDefinition | null, ApiError>({
        queryKey: ['metricflow_metric_definition', projectUuid, metricName],
        enabled: !!projectUuid && !!metricName,
        queryFn: () => getMetricDefinition(projectUuid!, metricName!),
        ...useQueryOptions,
    });
};

export default useMetricDefinition;
