import { ApiError, ApiTableResults, Explore } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';
import { lightdashApi } from '../api';

const getTable = async (tableId: string) =>
    lightdashApi<ApiTableResults>({
        url: `/tables/${tableId}`,
        method: 'GET',
        body: undefined,
    });

export const useTable = () => {
    const {
        errorLogs: { showError },
    } = useApp();
    const {
        state: { tableName: activeTableName },
    } = useExplorer();
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
            showError({ title: first, body: rest.join('\n') });
        }
    }, [query.error, showError]);

    return query;
};
