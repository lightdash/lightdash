import { type ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
    getMetricLineage,
    type MetricLineage,
} from '../../../api/MetricFlowAPI';

const useMetricLineage = (
    projectUuid?: string,
    metricName?: string,
    useQueryOptions?: UseQueryOptions<MetricLineage | null, ApiError>,
) => {
    return useQuery<MetricLineage | null, ApiError>({
        queryKey: ['metricflow_metric_lineage', projectUuid, metricName],
        enabled: !!projectUuid && !!metricName,
        queryFn: () => getMetricLineage(projectUuid!, metricName!),
        ...useQueryOptions,
    });
};

export default useMetricLineage;
