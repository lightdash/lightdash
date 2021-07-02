import { ApiCompiledQueryResults, ApiError, MetricQuery } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useExploreConfig } from './useExploreConfig';

const getCompiledQuery = async (tableId: string, query: MetricQuery) =>
    lightdashApi<ApiCompiledQueryResults>({
        url: `/tables/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useCompliedSql = () => {
    const {
        setError,
        activeTableName: tableId,
        activeDimensions: dimensions,
        activeMetrics: metrics,
        sortFields: sorts,
        activeFilters: filters,
        resultsRowLimit: limit,
    } = useExploreConfig();
    const metricQuery = {
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts,
        filters,
        limit: limit || 500,
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
            setError({ title: first, text: rest.join('\n') });
        }
    }, [query.error, setError]);

    return query;
};
