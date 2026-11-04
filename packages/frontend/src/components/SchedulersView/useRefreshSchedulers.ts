import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import useToaster from '../../hooks/toaster/useToaster';

export const useRefreshSchedulers = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();

    return useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries(['paginatedSchedulers']),
            queryClient.invalidateQueries(['schedulerRuns']),
        ]);

        showToastSuccess({
            title: 'Scheduled deliveries refreshed successfully',
        });
    }, [queryClient, showToastSuccess]);
};
