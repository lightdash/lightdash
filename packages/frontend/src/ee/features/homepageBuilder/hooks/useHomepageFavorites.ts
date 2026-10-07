import { ContentType, type SummaryContent } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import {
    useFavoriteMutation,
    type FavoriteMutationVariables,
} from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';

export type HomepageFavorite = {
    isFavorite: boolean;
    isLoading: boolean;
    onToggle: () => void;
};

export const useHomepageFavorites = (projectUuid: string) => {
    const { data: favorites, isInitialLoading } = useFavorites(projectUuid);
    const { mutate } = useFavoriteMutation(projectUuid);
    const queryClient = useQueryClient();
    const mutationCache = queryClient.getMutationCache();
    const subscribe = useCallback(
        (onChange: () => void) => mutationCache.subscribe(onChange),
        [mutationCache],
    );
    // A stable scalar snapshot also notices when the pending items change but
    // their count stays the same. Cached favorite data remains visible throughout.
    const getPendingUuids = useCallback(
        () =>
            mutationCache
                .findAll({
                    mutationKey: ['favorite_toggle', projectUuid],
                    fetching: true,
                })
                .map(
                    (mutation) =>
                        (
                            mutation.state
                                .variables as unknown as FavoriteMutationVariables
                        ).contentUuid,
                )
                .join(','),
        [mutationCache, projectUuid],
    );
    const pendingUuids = useSyncExternalStore(subscribe, getPendingUuids);
    const favoriteUuids = new Set(
        (favorites ?? []).map((item) => item.data.uuid),
    );

    return (content: SummaryContent): HomepageFavorite | undefined => {
        if (
            content.contentType === ContentType.SPACE ||
            (content.contentType === ContentType.DATA_APP && !content.space)
        )
            return undefined;

        return {
            isFavorite: favoriteUuids.has(content.uuid),
            isLoading:
                isInitialLoading ||
                pendingUuids.split(',').includes(content.uuid),
            onToggle: () => {
                // Read the cache at click time too, before another render can
                // disable duplicate occurrences of this item.
                if (
                    isInitialLoading ||
                    getPendingUuids().split(',').includes(content.uuid)
                )
                    return;
                mutate({
                    contentType: content.contentType,
                    contentUuid: content.uuid,
                });
            },
        };
    };
};
