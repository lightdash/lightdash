import { ApiError, ApiRefreshResults } from 'common';
import { useMutation, useQueryClient } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
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
    const {
        errorLogs: { showError },
    } = useApp();
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    return useMutation<void, ApiError>({
        mutationKey: 'refresh',
        mutationFn: () => refresh(projectUuid),
        onSettled: () => {
            queryClient.invalidateQueries('status');
            queryClient.invalidateQueries('table');
            queryClient.invalidateQueries('tables');
            queryClient.setQueryData('status', 'loading');
        },
        onError: (result) => setErrorResponse(result),
    });
};
