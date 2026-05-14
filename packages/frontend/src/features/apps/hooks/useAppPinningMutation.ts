import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const updateAppPinning = async ({
    projectUuid,
    appUuid,
}: {
    projectUuid: string;
    appUuid: string;
}) =>
    lightdashApi<TogglePinnedItemInfo>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/pinning`,
        method: 'PATCH',
        body: JSON.stringify({}),
    });

export const useAppPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        TogglePinnedItemInfo,
        ApiError,
        { projectUuid: string; appUuid: string }
    >(updateAppPinning, {
        mutationKey: ['app_pinning_update'],
        onSuccess: async (app, variables) => {
            await queryClient.invalidateQueries([
                'app',
                variables.projectUuid,
                variables.appUuid,
            ]);
            await queryClient.invalidateQueries(['pinned_items']);
            await queryClient.invalidateQueries(['spaces']);
            await queryClient.invalidateQueries([
                'space',
                app.projectUuid,
                app.spaceUuid,
            ]);
            await queryClient.invalidateQueries(['content']);

            if (app.isPinned) {
                showToastSuccess({
                    title: 'Success! Data app was pinned to homepage',
                });
            } else {
                showToastSuccess({
                    title: 'Success! Data app was unpinned from homepage',
                });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to pin data app',
                apiError: error,
            });
        },
    });
};
