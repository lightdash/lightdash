import { type ApiError, type TogglePinnedItemInfo } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

export const useDocumentPinningMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        TogglePinnedItemInfo,
        ApiError,
        { projectUuid: string; documentUuid: string }
    >(
        ({ projectUuid, documentUuid }) =>
            lightdashApi<TogglePinnedItemInfo>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/pinning`,
                method: 'PATCH',
                body: JSON.stringify({}),
            }),
        {
            mutationKey: ['document_pinning_update'],
            onSuccess: async ({ isPinned }) => {
                await Promise.all(
                    [
                        ['pinned_items'],
                        ['favorites'],
                        ['project'],
                        ['content'],
                        ['space'],
                        ['homepage_collection_content'],
                    ].map((key) => queryClient.invalidateQueries(key)),
                );
                showToastSuccess({
                    title: isPinned
                        ? 'Success! Document was pinned to homepage'
                        : 'Success! Document was unpinned from homepage',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to pin document',
                    apiError: error,
                });
            },
        },
    );
};
