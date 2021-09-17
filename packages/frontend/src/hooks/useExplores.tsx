import { useQuery } from 'react-query';
import { ApiError, ApiExploresResults } from 'common';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getExplores = async () =>
    lightdashApi<ApiExploresResults>({
        url: '/explores',
        method: 'GET',
        body: undefined,
    });

export const useExplores = () => {
    const {
        errorLogs: { showError },
    } = useApp();
    const queryKey = 'tables';
    const query = useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: getExplores,
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
