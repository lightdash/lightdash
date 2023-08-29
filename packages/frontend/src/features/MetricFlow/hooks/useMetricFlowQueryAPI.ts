import { ApiError } from '@lightdash/common';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import {
    createMetricFlowQuery,
    CreateMetricFlowQueryResponse,
} from '../../../api/MetricFlowAPI';

export const useMetricFlowQueryAPI = (
    projectUuid: string | undefined,
    query?: {
        metrics: string[];
        dimensions: string[];
    },
    useQueryOptions?: UseQueryOptions<CreateMetricFlowQueryResponse, ApiError>,
) => {
    return useQuery<CreateMetricFlowQueryResponse, ApiError>({
        queryKey: ['metric_flow_query', projectUuid, query],
        enabled: !!projectUuid && !!query?.metrics.length,
        queryFn: () => createMetricFlowQuery(projectUuid!, query!),
        ...useQueryOptions,
    });
};
