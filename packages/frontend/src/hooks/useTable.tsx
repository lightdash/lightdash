import { ApiError, ApiTableResults, Explore } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { useExploreConfig } from './useExploreConfig';
import { lightdashApi } from '../api';

const getTable = async (tableId: string) =>
    lightdashApi<ApiTableResults>({
        url: `/tables/${tableId}`,
        method: 'GET',
        body: undefined,
    });

export const useTable = () => {
    const { activeTableName, setError } = useExploreConfig();
    const queryKey = ['tables', activeTableName];
    const query = useQuery<Explore, ApiError>({
        queryKey,
        queryFn: () => getTable(activeTableName || ''),
        enabled: activeTableName !== undefined,
        retry: false,
    });

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n');
            setError({ title: first, text: rest.join('\n') });
        }
    }, [query.error, setError]);

    return query;
};
