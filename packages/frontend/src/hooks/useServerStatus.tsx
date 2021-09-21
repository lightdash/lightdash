import { ApiError, ApiStatusResults } from 'common';
import { useQuery } from 'react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getStatus = async (projectUuid: string) =>
    lightdashApi<ApiStatusResults>({
        method: 'GET',
        url: `/projects/${projectUuid}/status`,
        body: undefined,
    });

export const useServerStatus = (refetchInterval = 5000) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryKey = 'status';
    const {
        errorLogs: { showError },
    } = useApp();
    const query = useQuery<ApiStatusResults, ApiError>({
        queryKey,
        queryFn: () => getStatus(projectUuid),
        refetchInterval,
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
