import { ApiError, ApiExploresResults } from '@lightdash/common';
import { useQuery } from 'react-query';
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

export const useExplores = (projectUuid: string, filtered?: boolean) => {
    const setErrorResponse = useQueryError();
    const queryKey = ['tables', projectUuid, filtered ? 'filtered' : 'all'];
    return useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: () => getExplores(projectUuid, filtered),
        onError: (result) => setErrorResponse(result),
        retry: false,
    });
};
