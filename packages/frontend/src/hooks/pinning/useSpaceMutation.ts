import { type ApiError, type Space } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateSpacePinning = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}/pinning`,
        method: 'PATCH',
        body: undefined,
    });

export const useSpacePinningMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<Space, ApiError, string>(
        (spaceUuid) => updateSpacePinning(projectUuid, spaceUuid),
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

                if (space.pinnedListUuid) {
                    showToastSuccess({
                        title: 'Success! Space was pinned to homepage',
                    });
                } else {
                    showToastSuccess({
                        title: 'Success! Space was unpinned from homepage',
                    });
                }
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to pin space',
                    apiError: error,
                });
            },
        },
    );
};
