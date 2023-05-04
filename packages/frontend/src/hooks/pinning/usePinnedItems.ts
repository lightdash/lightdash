import {
    ApiError,
    PinnedItems,
    UpdatePinnedItemOrder,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
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
    const { showToastError } = useToaster();
    return useMutation<PinnedItems, ApiError, UpdatePinnedItemOrder[]>(
        (pinnedItemsOrder: UpdatePinnedItemOrder[]) =>
            updatePinnedItemsOrder(
                projectUuid,
                pinnedlistUuid,
                pinnedItemsOrder,
            ),
        {
            onSuccess: async (data) => {
                queryClient.setQueryData(
                    ['pinned_items', projectUuid, pinnedlistUuid],
                    data,
                );
                await queryClient.invalidateQueries([
                    'pinned_items',
                    projectUuid,
                    pinnedlistUuid,
                ]);
            },
            onError: (error) => {
                showToastError({
                    title: `Could not re-order pinned items. Please try again. Error: ${error.error}`,
                });
            },
        },
    );
};
