import { ApiError, ApiExploresResults } from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
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
    const queryKey = ['tables', projectUuid, 'all'];
    return useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: () => getExplores(projectUuid),
        onError: (result) => setErrorResponse(result),
        retry: false,
    });
};
