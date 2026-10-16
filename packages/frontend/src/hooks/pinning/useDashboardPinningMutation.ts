import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateDashboardPinning = async (data: { uuid: string }) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/dashboards/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useDashboardPinningMutation = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<TogglePinnedItemInfo, ApiError, { uuid: string }>(
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
                await queryClient.invalidateQueries(['content']);

                if (dashboard.isPinned) {
                    showToastSuccess({
                        title: t(
                            'useDashboardPinningMutation.successDashboardWasPinnedToHomepage',
                        ),
                    });
                } else {
                    showToastSuccess({
                        title: t(
                            'useDashboardPinningMutation.successDashboardWasUnpinnedFromHomepage',
                        ),
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'useDashboardPinningMutation.failedToPinDashboard',
                    ),
                    apiError: error,
                });
            },
        },
    );
};
