import { ApiError, ApiRefreshResults } from 'common';
import { useMutation, useQueryClient } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import useQueryError from './useQueryError';

const refresh = async (projectUuid: string) => {
    await lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/refresh`,
        body: undefined,
    });
};

export const useRefreshServer = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    return useMutation<void, ApiError>({
        mutationKey: 'refresh',
        mutationFn: () => refresh(projectUuid),
        onSettled: async () => {
            queryClient.setQueryData('status', 'loading');
        },
        onError: (result) => setErrorResponse(result),
    });
};
