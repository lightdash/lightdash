import { ApiError, ApiQueryResults, MetricQuery } from 'common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';

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

export const useQueryResults = (pristine = true) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const {
        [pristine ? 'pristineState' : 'state']: {
            tableName: tableId,
            dimensions,
            metrics,
            sorts,
            filters,
            limit,
            tableCalculations,
            selectedTableCalculations,
        },
        actions: { syncState },
    } = useExplorer();
    const {
        errorLogs: { showError },
    } = useApp();
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
        enabled: false, // don't run automatically
        keepPreviousData: true, // changing the query won't update results until fetch
        retry: false,
        onSettled: (data) => {
            // Update the pristine state once the query request is completed.
            syncState();
        },
        onError: (error) => {
            const [first, ...rest] = error.error.message.split('\n');
            showError({ title: first, body: rest.join('\n') });
        },
    });
};
