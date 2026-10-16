import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('apps');
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
                    title: t('toasts.pinned'),
                });
            } else {
                showToastSuccess({
                    title: t('toasts.unpinned'),
                });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('toasts.pinFailed'),
                apiError: error,
            });
        },
    });
};
