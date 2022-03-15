import { ApiError, ApiExploresResults } from 'common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const getExplores = async (projectUuid: string, filtered?: boolean) =>
    lightdashApi<ApiExploresResults>({
        url: `/projects/${projectUuid}/explores?filtered=${
            filtered ? 'true' : 'false'
        }`,
        method: 'GET',
        body: undefined,
    });

export const useExplores = (filtered?: boolean) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const setErrorResponse = useQueryError();
    const queryKey = ['tables', projectUuid, filtered ? 'filtered' : 'all'];
    return useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: () => getExplores(projectUuid, filtered),
        onError: (result) => setErrorResponse(result),
        retry: false,
    });
};
