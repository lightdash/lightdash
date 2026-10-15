import { type ApiError, type Space } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateSpacePinning = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}/pinning`,
        method: 'PATCH',
        body: undefined,
    });

export const useSpacePinningMutation = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<Space, ApiError, string>(
        (spaceUuid) =>
            projectUuid
                ? updateSpacePinning(projectUuid, spaceUuid)
                : Promise.reject(),
        {
            mutationKey: ['space_pinning_update'],
            onSuccess: async (space) => {
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'spaces',
                    space.projectUuid,
                ]);
                await queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]);
                await queryClient.invalidateQueries([
                    'space',
                    space.projectUuid,
                    space.uuid,
                ]);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);

                if (space.pinnedListUuid) {
                    showToastSuccess({
                        title: t(
                            'useSpaceMutation.successSpaceWasPinnedToHomepage',
                        ),
                    });
                } else {
                    showToastSuccess({
                        title: t(
                            'useSpaceMutation.successSpaceWasUnpinnedFromHomepage',
                        ),
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('useSpaceMutation.failedToPinSpace'),
                    apiError: error,
                });
            },
        },
    );
};
