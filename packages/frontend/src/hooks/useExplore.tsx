import { ApiError, ApiExploreResults } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useApp } from '../providers/AppProvider';
import { lightdashApi } from '../api';

const getExplore = async (exploreId: string) =>
    lightdashApi<ApiExploreResults>({
        url: `/explores/${exploreId}`,
        method: 'GET',
        body: undefined,
    });

export const useExplore = () => {
    const {
        errorLogs: { showError },
    } = useApp();
    const {
        state: { tableName: activeTableName },
    } = useExplorer();
    const queryKey = ['tables', activeTableName];
    const query = useQuery<ApiExploreResults, ApiError>({
        queryKey,
        queryFn: () => getExplore(activeTableName || ''),
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
