import { type ApiError, type SavedChart } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateChartPinning = async (data: { uuid: string }) =>
    lightdashApi<SavedChart>({
        url: `/saved/${data.uuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useChartPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<SavedChart, ApiError, { uuid: string }>(
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
                if (savedChart.pinnedListUuid) {
                    showToastSuccess({
                        title: 'Success! Chart was pinned to homepage',
                    });
                } else {
                    showToastSuccess({
                        title: 'Success! Chart was unpinned from homepage',
                    });
                }
            },
            onError: (error) => {
                showToastError({
                    title: 'Failed to pin chart',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
