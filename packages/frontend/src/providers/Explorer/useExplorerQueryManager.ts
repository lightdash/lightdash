import { useCallback, useEffect, useState } from 'react';
import {
    type QueryResultsProps,
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from '../../hooks/useQueryResults';

export const useQueryManager = (
    queryArgs: QueryResultsProps | null,
    missingRequiredParameters: string[] | null,
    enabled: boolean = true,
) => {
    const query = useGetReadyQueryResults(
        enabled ? queryArgs : null,
        enabled ? missingRequiredParameters : null,
    );
    const [queryUuidHistory, setQueryUuidHistory] = useState<string[]>([]);

    useEffect(() => {
        if (query.data) {
            setQueryUuidHistory((prev) => [...prev, query.data.queryUuid]);
        }
    }, [query.data]);

    const queryResults = useInfiniteQueryResults(
        queryArgs?.projectUuid,
        queryUuidHistory[queryUuidHistory.length - 1],
    );

    const clearQuery = useCallback(() => {
        query.remove();
        setQueryUuidHistory([]);
    }, [query]);

    return { query, queryResults, clearQuery, setQueryUuidHistory };
};
