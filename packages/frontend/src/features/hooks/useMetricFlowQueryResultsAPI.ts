import { ApiError } from '@lightdash/common';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import {
    getMetricFlowQueryResults,
    GetMetricFlowQueryResultsResponse,
    QueryStatus,
} from '../../api/MetricFlowAPI';

export const useMetricFlowQueryResultsAPI = (
    projectUuid: string | undefined,
    queryId: string | undefined,
    useQueryOptions?: UseQueryOptions<
        GetMetricFlowQueryResultsResponse,
        ApiError
    >,
) => {
    return useQuery<GetMetricFlowQueryResultsResponse, ApiError>({
        queryKey: ['metric_flow_query_results', projectUuid, queryId],
        enabled: !!projectUuid && !!queryId,
        queryFn: () => getMetricFlowQueryResults(projectUuid!, queryId!),
        refetchInterval: (data) => {
            return data === undefined ||
                [QueryStatus.SUCCESSFUL, QueryStatus.FAILED].includes(
                    data.query.status,
                )
                ? false
                : 500;
        },
        ...useQueryOptions,
    });
};
