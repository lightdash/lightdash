import { ApiError, ApiQueryResults, MetricQuery, SavedChart } from 'common';
import { useCallback } from 'react';
import { useMutation, useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { ExplorerState } from '../providers/ExplorerProvider';
import useQueryError from './useQueryError';

export const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
}) =>
    lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useQueryResults = (state: ExplorerState) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const mutation = useMutation<
        ApiQueryResults,
        ApiError,
        {
            projectUuid: string;
            tableId: string;
            query: MetricQuery;
        }
    >(getQueryResults, {
        mutationKey: ['queryResults', projectUuid],
        onError: (result) => setErrorResponse(result),
    });

    const mutate = useCallback(() => {
        if (!!state.tableName && state.isValidQuery) {
            mutation.mutate({
                projectUuid,
                tableId: state.tableName,
                query: {
                    dimensions: Array.from(state.dimensions),
                    metrics: Array.from(state.metrics),
                    sorts: state.sorts,
                    filters: state.filters,
                    limit: state.limit || 500,
                    tableCalculations: state.tableCalculations.filter(
                        ({ name }) =>
                            state.selectedTableCalculations.includes(name),
                    ),
                    additionalMetrics: state.additionalMetrics,
                },
            });
        }
    }, [mutation, projectUuid, state]);

    return { ...mutation, mutate };
};

export const useSavedChartResults = (
    projectUuid: string,
    savedChart: SavedChart,
) => {
    const queryKey = [
        'savedChartResults',
        savedChart.uuid,
        JSON.stringify(savedChart),
        projectUuid,
    ];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getQueryResults({
                projectUuid,
                tableId: savedChart.tableName,
                query: savedChart.metricQuery,
            }),
        retry: false,
        refetchOnMount: false,
    });
};
