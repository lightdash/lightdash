import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateChartPinning = async (data: { uuid: string }) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/saved/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useChartPinningMutation = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<TogglePinnedItemInfo, ApiError, { uuid: string }>(
        updateChartPinning,
        {
            mutationKey: ['chart_pinning_update'],
            onSuccess: async (savedChart, variables) => {
                await queryClient.invalidateQueries([
                    'saved_query',
                    variables.uuid,
                ]);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries([
                    'space',
                    savedChart.projectUuid,
                    savedChart.spaceUuid,
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
                if (savedChart.isPinned) {
                    showToastSuccess({
                        title: t(
                            'useChartPinningMutation.successChartWasPinnedToHomepage',
                        ),
                    });
                } else {
                    showToastSuccess({
                        title: t(
                            'useChartPinningMutation.successChartWasUnpinnedFromHomepage',
                        ),
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('useChartPinningMutation.failedToPinChart'),
                    apiError: error,
                });
            },
        },
    );
};
