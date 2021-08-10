import { ApiError, ApiStatusResults } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getStatus = async () =>
    lightdashApi<ApiStatusResults>({
        method: 'GET',
        url: '/status',
        body: undefined,
    });

export const useServerStatus = () => {
    const queryKey = 'status';
    const {
        errorLogs: { showError },
    } = useApp();
    const query = useQuery<ApiStatusResults, ApiError>({
        queryKey,
        queryFn: getStatus,
        refetchInterval: 5000,
        refetchIntervalInBackground: false,
    });

    useEffect(() => {
        if (query.error) {
            const [first, ...rest] = query.error.error.message.split('\n');
            showError({ title: first, body: rest.join('\n') });
        }
    }, [query.error, showError]);

    return query;
};
