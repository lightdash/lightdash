import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const updateDashboardPinning = async (
    lightdashApi: LightdashApi,
    data: { uuid: string },
) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/dashboards/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useDashboardPinningMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<TogglePinnedItemInfo, ApiError, { uuid: string }>(
        (data: { uuid: string }) => updateDashboardPinning(lightdashApi, data),
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
                await queryClient.invalidateQueries(['content']);

                if (dashboard.isPinned) {
                    showToastSuccess({
                        title: 'Success! Dashboard was pinned to homepage',
                    });
                } else {
                    showToastSuccess({
                        title: 'Success! Dashboard was unpinned from homepage',
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to pin dashboard',
                    apiError: error,
                });
            },
        },
    );
};
