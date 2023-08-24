import { ApiError } from '@lightdash/common';
import { useQuery } from 'react-query';
import { UseQueryOptions } from 'react-query/types/react/types';
import {
    getMetricFlowQueryResults,
    GetMetricFlowQueryResultsResponse,
    QueryStatus,
} from '../../../api/MetricFlowAPI';

export const useMetricFlowQueryResultsAPI = (
    projectUuid: string | undefined,
    queryId: string | undefined,
    useQueryOptions?: UseQueryOptions<
        GetMetricFlowQueryResultsResponse,
        ApiError
    >,
): Pick<
    ReturnType<typeof useQuery<GetMetricFlowQueryResultsResponse, ApiError>>,
    'isLoading' | 'data' | 'error' | 'status'
> => {
    const { data, isLoading, error, status } = useQuery<
        GetMetricFlowQueryResultsResponse,
        ApiError
    >({
        queryKey: ['metric_flow_query_results', projectUuid, queryId],
        enabled: !!projectUuid && !!queryId,
        queryFn: () => getMetricFlowQueryResults(projectUuid!, queryId!),
        refetchInterval: (refetchData) => {
            return refetchData === undefined ||
                [QueryStatus.SUCCESSFUL, QueryStatus.FAILED].includes(
                    refetchData.query.status,
                )
                ? false
                : 500;
        },
        ...useQueryOptions,
    });

    if (data?.query.status === QueryStatus.SUCCESSFUL) {
        return {
            isLoading,
            error,
            data,
            status,
        };
    }
    if (data?.query.status === QueryStatus.FAILED) {
        return {
            isLoading,
            error: {
                status: 'error',
                error: {
                    name: 'ApiError',
                    statusCode: 500,
                    message: data.query.error || 'Unknown error',
                    data: {},
                },
            },
            data: undefined,
            status: 'error',
        };
    }
    if (!!data?.query.status) {
        return {
            isLoading: true,
            error: null,
            data: undefined,
            status: 'loading',
        };
    }
    return {
        isLoading,
        error,
        data: undefined,
        status,
    };
};
