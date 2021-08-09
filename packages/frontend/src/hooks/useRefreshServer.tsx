import { ApiError, ApiRefreshResults } from 'common';
import { useMutation, useQueryClient } from 'react-query';
import { useEffect } from 'react';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const refresh = async () => {
    await lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: '/refresh',
        body: undefined,
    });
};

export const useRefreshServer = () => {
    const { showError } = useApp();
    const queryClient = useQueryClient();
    const refreshMutation = useMutation<void, ApiError>({
        mutationKey: 'refresh',
        mutationFn: refresh,
        onSettled: () => {
            queryClient.invalidateQueries('status');
            queryClient.invalidateQueries('table');
            queryClient.invalidateQueries('tables');
            queryClient.setQueryData('status', 'loading');
        },
    });

    useEffect(() => {
        if (refreshMutation.error) {
            const [first, ...rest] =
                refreshMutation.error.error.message.split('\n');
            showError({ title: first, subtitle: rest.join('\n') });
        }
    }, [refreshMutation.error, showError]);

    return refreshMutation;
};
