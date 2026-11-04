import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const updateChartPinning = async (
    lightdashApi: LightdashApi,
    data: { uuid: string },
) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/saved/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useChartPinningMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<TogglePinnedItemInfo, ApiError, { uuid: string }>(
        (data: { uuid: string }) => updateChartPinning(lightdashApi, data),
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
                        title: 'Success! Chart was pinned to homepage',
                    });
                } else {
                    showToastSuccess({
                        title: 'Success! Chart was unpinned from homepage',
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to pin chart',
                    apiError: error,
                });
            },
        },
    );
};
