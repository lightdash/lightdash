import { useQuery } from 'react-query';
import { ApiError, ApiExploresResults } from 'common';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getExplores = async (projectUuid: string) =>
    lightdashApi<ApiExploresResults>({
        url: `/projects/${projectUuid}/explores`,
        method: 'GET',
        body: undefined,
    });

export const useExplores = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const {
        errorLogs: { showError },
    } = useApp();
    const queryKey = 'tables';
    const query = useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: () => getExplores(projectUuid),
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
