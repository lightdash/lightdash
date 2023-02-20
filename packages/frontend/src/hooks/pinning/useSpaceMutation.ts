import { ApiError, Space } from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
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
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<Space, ApiError, string>(
        (spaceUuid) => updateSpacePinning(projectUuid, spaceUuid),
        {
            mutationKey: ['space_pinning_update'],
            onSuccess: async (space) => {
                await queryClient.invalidateQueries([
                    'spaces',
                    space.projectUuid,
                ]);
                await queryClient.invalidateQueries([
                    'space',
                    space.projectUuid,
                    space.uuid,
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
            onError: (error) => {
                showToastError({
                    title: 'Failed to pin space',
                    subtitle: error.error.message,
                });
            },
        },
    );
};
