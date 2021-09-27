import { ApiError, ApiStatusResults } from 'common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

const getStatus = async (projectUuid: string) =>
    lightdashApi<ApiStatusResults>({
        method: 'GET',
        url: `/projects/${projectUuid}/status`,
        body: undefined,
    });

export const useServerStatus = (refetchInterval = 5000) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [, setErrorResponse] = useQueryError();
    const queryKey = 'status';
    const {
        errorLogs: { showError },
    } = useApp();
    return useQuery<ApiStatusResults, ApiError>({
        queryKey,
        queryFn: () => getStatus(projectUuid),
        refetchInterval,
        onError: (result) => setErrorResponse(result.error),
        refetchIntervalInBackground: false,
    });
};
