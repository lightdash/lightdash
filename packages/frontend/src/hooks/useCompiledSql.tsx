import { ApiCompiledQueryResults, ApiError, MetricQuery } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import { useExplorer } from '../providers/ExplorerProvider';

const getCompiledQuery = async (tableId: string, query: MetricQuery) =>
    lightdashApi<ApiCompiledQueryResults>({
        url: `/tables/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useCompliedSql = () => {
    const {
        state: {
            tableName: tableId,
            dimensions,
            metrics,
            sorts,
            filters,
            limit,
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
        tableCalculations: [],
    };
    const queryKey = ['compiledQuery', tableId, metricQuery];
    const query = useQuery<ApiCompiledQueryResults, ApiError>({
        enabled: tableId !== undefined,
        queryKey,
        queryFn: () => getCompiledQuery(tableId || '', metricQuery),
    });

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n');
            showError({ title: first, body: rest.join('\n') });
        }
    }, [query.error, showError]);

    return query;
};
