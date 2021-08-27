import { ApiError, ApiQueryResults, MetricQuery } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';

export const getQueryResults = async (tableId: string, query: MetricQuery) =>
    lightdashApi<ApiQueryResults>({
        url: `/tables/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useQueryResults = () => {
    const {
        state: {
            tableName: tableId,
            dimensions,
            metrics,
            sorts,
            filters,
            limit,
            tableCalculations,
            selectedTableCalculations,
        },
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
    const query = useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () => getQueryResults(tableId || '', metricQuery),
        enabled: false, // don't run automatically
        keepPreviousData: true, // changing the query won't update results until fetch
        retry: false,
    });

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n');
            showError({ title: first, body: rest.join('\n') });
        }
    }, [query.error, showError]);

    return query;
};
