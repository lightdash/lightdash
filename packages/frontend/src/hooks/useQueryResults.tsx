import { ApiError, ApiQueryResults, MetricQuery, SavedChart } from 'common';
import { useEffect, useMemo } from 'react';
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

export const useQueryResults = ({
    tableName: tableId,
    dimensions,
    metrics,
    sorts,
    filters,
    limit,
    tableCalculations,
    selectedTableCalculations,
    isValidQuery,
    additionalMetrics,
}: ExplorerState) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const metricQuery: MetricQuery = useMemo(
        () => ({
            dimensions: Array.from(dimensions),
            metrics: Array.from(metrics),
            sorts,
            filters,
            limit: limit || 500,
            tableCalculations: tableCalculations.filter(({ name }) =>
                selectedTableCalculations.includes(name),
            ),
            additionalMetrics,
        }),
        [
            additionalMetrics,
            dimensions,
            filters,
            limit,
            metrics,
            selectedTableCalculations,
            sorts,
            tableCalculations,
        ],
    );
    const mutation = useMutation<
        ApiQueryResults,
        ApiError,
        {
            projectUuid: string;
            tableId: string;
            query: MetricQuery;
        }
    >(getQueryResults, {
        mutationKey: ['queryResults', tableId, metricQuery, projectUuid],
        onError: (result) => setErrorResponse(result),
    });

    // Note: temporary solution, to be replaced in the next PR
    const { mutate } = mutation;
    useEffect(() => {
        if (!!tableId && isValidQuery) {
            mutate({ projectUuid, tableId, query: metricQuery });
        }
    }, [mutate, projectUuid, tableId, isValidQuery, metricQuery]);

    return mutation;
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
