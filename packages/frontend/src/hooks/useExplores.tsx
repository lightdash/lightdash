import { useQuery } from 'react-query';
import { ApiError, ApiExploresResults } from 'common';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

const getExplores = async (projectUuid: string) =>
    lightdashApi<ApiExploresResults>({
        url: `/projects/${projectUuid}/explores`,
        method: 'GET',
        body: undefined,
    });

export const useExplores = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const {
        errorLogs: { showError },
    } = useApp();
    const queryKey = 'tables';
    return useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: () => getExplores(projectUuid),
        onError: (result) => setErrorResponse(result),
        retry: false,
    });
};
