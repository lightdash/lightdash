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
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError();
    const { showToastSuccess } = useApp();
    return useMutation<void, ApiError>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: () => refresh(projectUuid),
        onSettled: async (data) => {
            queryClient.setQueryData('status', 'loading');
            showToastSuccess({
                title: `Chart successfully duplicated!`,
                action: {
                    text: 'View log ',
                    icon: 'arrow-right',
                    onClick: () => console.log(data),
                },
            });
        },
        onError: (result) => setErrorResponse(result),
    });
};
