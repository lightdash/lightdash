import { ApiError, ApiPinnedItems, PinnedItems } from '@lightdash/common';
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
    pinnedItems: PinnedItems,
) => {
    return lightdashApi<PinnedItems>({
        url: `/projects/${projectUuid}/pinned-lists/${pinnedListUuid}/items/order`,
        method: 'PATCH',
        body: JSON.stringify(pinnedItems),
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

export const usePinnedItemsOrder = (
    projectUuid: string,
    pinnedlistUuid: string,
    pinnedItems: PinnedItems,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<PinnedItems, ApiError, PinnedItems>(
        () => updatePinnedItemsOrder(projectUuid, pinnedlistUuid, pinnedItems),
        {
            onSuccess: (data) => {
                queryClient.setQueryData(
                    ['pinned_items', projectUuid, pinnedlistUuid],
                    data,
                );
                showToastSuccess({ title: 'Pinned items order updated' });
            },
            onError: (error) => {
                showToastError({
                    title: `Pinned items order update failed. Error: ${error}.`,
                });
            },
        },
    );
};
