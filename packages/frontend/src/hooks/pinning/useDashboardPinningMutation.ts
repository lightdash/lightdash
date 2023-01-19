import { ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateDashboardPinning = async (data: { uuid: string }) =>
    lightdashApi<undefined>({
        url: `/dashboards/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useDashboardPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, { uuid: string }>(
        updateDashboardPinning,
        {
            mutationKey: ['dashboard_pinning_update'],
            onSuccess: async (_, variables) => {
                await queryClient.invalidateQueries([
                    'saved_dashboard_query',
                    variables.uuid,
                ]);
                showToastSuccess({
                    title: 'Success! Dashboard was pinned to homepage',
                });
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to pin dashboard',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
