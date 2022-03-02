import { ApiError, ApiQueryResults, MetricQuery, SavedChart } from 'common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useExplorer } from '../providers/ExplorerProvider';
import useQueryError from './useQueryError';

export const getQueryResults = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
) =>
    lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useQueryResults = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const {
        pristineState: {
            tableName: tableId,
            dimensions,
            metrics,
            sorts,
            filters,
            limit,
            tableCalculations,
            selectedTableCalculations,
            isValidQuery,
        },
    } = useExplorer();
    const metricQuery: MetricQuery = {
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts,
        filters,
        limit: limit || 500,
        tableCalculations: tableCalculations.filter(({ name }) =>
            selectedTableCalculations.includes(name),
        ),
    };
    const queryKey = ['queryResults', tableId, metricQuery];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () => getQueryResults(projectUuid, tableId || '', metricQuery),
        enabled: !!tableId && isValidQuery,
        retry: false,
        refetchOnMount: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useSavedChartResults = (
    projectUuid: string,
    savedChart: SavedChart,
) => {
    const queryKey = [
        'savedChartResults',
        savedChart.uuid,
        JSON.stringify(savedChart),
    ];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getQueryResults(
                projectUuid,
                savedChart.tableName,
                savedChart.metricQuery,
            ),
        retry: false,
        refetchOnMount: false,
    });
};
