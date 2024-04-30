import { type ApiError, type Dashboard } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateDashboardPinning = async (data: { uuid: string }) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useDashboardPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<Dashboard, ApiError, { uuid: string }>(
        updateDashboardPinning,
        {
            mutationKey: ['dashboard_pinning_update'],
            onSuccess: async (dashboard, variables) => {
                await queryClient.invalidateQueries([
                    'saved_dashboard_query',
                    variables.uuid,
                ]);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries(['dashboards']);
                await queryClient.invalidateQueries([
                    'space',
                    dashboard.projectUuid,
                    dashboard.spaceUuid,
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);

                if (dashboard.pinnedListUuid) {
                    showToastSuccess({
                        title: 'Success! Dashboard was pinned to homepage',
                    });
                } else {
                    showToastSuccess({
                        title: 'Success! Dashboard was unpinned from homepage',
                    });
                }
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
