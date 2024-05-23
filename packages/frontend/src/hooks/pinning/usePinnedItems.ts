import {
    type ApiError,
    type PinnedItems,
    type UpdatePinnedItemOrder,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getPinnedItems = async (projectUuid: string, pinnedlistUuid: string) =>
    lightdashApi<PinnedItems>({
        url: `/projects/${projectUuid}/pinned-lists/${pinnedlistUuid}/items`,
        method: 'GET',
        body: undefined,
    });

const updatePinnedItemsOrder = async (
    projectUuid: string,
    pinnedListUuid: string,
    pinnedItemsOrder: UpdatePinnedItemOrder[],
) => {
    return lightdashApi<PinnedItems>({
        url: `/projects/${projectUuid}/pinned-lists/${pinnedListUuid}/items/order`,
        method: 'PATCH',
        body: JSON.stringify(pinnedItemsOrder),
    });
};

export const usePinnedItems = (
    projectUuid: string,
    pinnedlistUuid: string | undefined,
) =>
    useQuery<PinnedItems, ApiError>({
        queryKey: ['pinned_items', projectUuid, pinnedlistUuid],
        queryFn: () => getPinnedItems(projectUuid, pinnedlistUuid || ''),
        enabled: !!pinnedlistUuid,
    });

export const useReorder = (projectUuid: string, pinnedlistUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<PinnedItems, ApiError, PinnedItems>(
        (pinnedItems) => {
            queryClient.setQueryData(
                ['pinned_items', projectUuid, pinnedlistUuid],
                pinnedItems,
            );
            return updatePinnedItemsOrder(
                projectUuid,
                pinnedlistUuid,
                pinnedItems.map((pinnedItem) => ({
                    type: pinnedItem.type,
                    data: {
                        uuid: pinnedItem.data.uuid,
                        pinnedListOrder: pinnedItem.data.pinnedListOrder,
                    },
                })),
            );
        },
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'pinned_items',
                    projectUuid,
                    pinnedlistUuid,
                ]);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Could not re-order pinned items`,
                    apiError: error,
                });
            },
        },
    );
};
