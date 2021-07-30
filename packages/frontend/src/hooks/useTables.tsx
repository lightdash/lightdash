import { useQuery } from 'react-query';
import { ApiError, ApiTablesResults, PartialTable } from 'common';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getTables = async () =>
    lightdashApi<ApiTablesResults>({
        url: '/tables',
        method: 'GET',
        body: undefined,
    });

export const useTables = () => {
    const { showError } = useApp();
    const queryKey = 'tables';
    const query = useQuery<PartialTable[], ApiError>({
        queryKey,
        queryFn: getTables,
        retry: false,
    });

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n');
            showError({ title: first, subtitle: rest.join('\n') });
        }
    }, [query.error, showError]);

    return query;
};
