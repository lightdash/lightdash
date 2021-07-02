import { ApiError, ApiQueryResults, MetricQuery } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useExploreConfig } from './useExploreConfig';

export const getQueryResults = async (tableId: string, query: MetricQuery) =>
    lightdashApi<ApiQueryResults>({
        url: `/tables/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useQueryResults = () => {
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
    const queryKey = ['queryResults', tableId, metricQuery];
    const query = useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () => getQueryResults(tableId || '', metricQuery),
        enabled: false, // don't run automatically
        keepPreviousData: true, // changing the query won't update results until fetch
    });

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n');
            setError({ title: first, text: rest.join('\n') });
        }
    }, [query.error, setError]);

    return query;
};
