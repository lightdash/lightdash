import { friendlyName, type ApiError } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type ComponentProps } from 'react';
import {
    createMetricFlowQuery,
    getMetricFlowQueryResults,
    QueryStatus,
    type CreateMetricFlowQueryResponse,
    type GetMetricFlowQueryResultsResponse,
    type TimeGranularity,
} from '../../../api/MetricFlowAPI';
import type Table from '../../../components/common/Table';

type ApiRequestsState = Pick<
    ReturnType<typeof useQuery<GetMetricFlowQueryResultsResponse, ApiError>>,
    'isLoading' | 'data' | 'error'
> &
    Pick<
        ReturnType<typeof useQuery<CreateMetricFlowQueryResponse, ApiError>>,
        'refetch'
    > & {
        status: ComponentProps<typeof Table>['status'];
    };

const useMetricFlowQueryResults = (
    projectUuid: string | undefined,
    query?: {
        metrics: Record<string, {}>;
        dimensions: Record<string, { grain: TimeGranularity }>;
    },
    useCreateQueryOptions?: UseQueryOptions<
        CreateMetricFlowQueryResponse,
        ApiError
    >,
    useResultQueryOptions?: UseQueryOptions<
        GetMetricFlowQueryResultsResponse,
        ApiError
    >,
): ApiRequestsState => {
    const metricFlowQuery = useQuery<CreateMetricFlowQueryResponse, ApiError>({
        queryKey: ['metric_flow_query', projectUuid, query],
        enabled: !!projectUuid && !!Object.keys(query?.metrics ?? {}).length,
        queryFn: () => createMetricFlowQuery(projectUuid!, query!),
        staleTime: 0,
        cacheTime: 0,
        ...useCreateQueryOptions,
    });
    const queryId = metricFlowQuery.data?.createQuery.queryId;
    const metricFlowQueryResultsQuery = useQuery<
        GetMetricFlowQueryResultsResponse,
        ApiError
    >({
        queryKey: ['metric_flow_query_results', projectUuid, queryId],
        enabled: !!projectUuid && !!queryId && metricFlowQuery.isSuccess,
        queryFn: () => getMetricFlowQueryResults(projectUuid!, queryId!),
        refetchInterval: (refetchData) => {
            return refetchData === undefined ||
                [QueryStatus.SUCCESSFUL, QueryStatus.FAILED].includes(
                    refetchData.query.status,
                )
                ? false
                : 1000;
        },
        ...useResultQueryOptions,
    });

    const isResultsQueryRefetching =
        !!metricFlowQueryResultsQuery.data &&
        ![QueryStatus.SUCCESSFUL, QueryStatus.FAILED].includes(
            metricFlowQueryResultsQuery.data?.query.status,
        );

    if (isResultsQueryRefetching) {
        return {
            isLoading: true,
            error: null,
            data: undefined,
            status: 'loading',
            refetch: metricFlowQuery.refetch,
        };
    }

    if (metricFlowQueryResultsQuery.data?.query.status === QueryStatus.FAILED) {
        let errorMessage =
            metricFlowQueryResultsQuery.data.query.error || 'Unknown error';

        const requiredDimension = errorMessage.match(
            /group-by-items do not include '(.*)'/,
        );
        if (requiredDimension && requiredDimension[1]) {
            errorMessage = `The "${friendlyName(
                requiredDimension[1],
            )}" dimension is required to calculate metrics values.`;
        }

        return {
            isLoading: false,
            error: {
                status: 'error',
                error: {
                    name: 'ApiError',
                    statusCode: 500,
                    message: errorMessage,
                    data: {},
                },
            },
            data: undefined,
            status: 'error',
            refetch: metricFlowQuery.refetch,
        };
    }

    const isIdle = !metricFlowQuery.isFetched && !metricFlowQuery.isFetching;
    if (isIdle) {
        return {
            isLoading: false,
            error: null,
            data: undefined,
            status: 'idle',
            refetch: metricFlowQuery.refetch,
        };
    }

    return {
        isLoading:
            metricFlowQuery.isInitialLoading ||
            metricFlowQueryResultsQuery.isInitialLoading,
        error: metricFlowQuery.error || metricFlowQueryResultsQuery.error,
        data: metricFlowQueryResultsQuery.data,
        status: metricFlowQuery.isInitialLoading
            ? metricFlowQuery.status
            : metricFlowQueryResultsQuery.status,
        refetch: metricFlowQuery.refetch,
    };
};

export default useMetricFlowQueryResults;
