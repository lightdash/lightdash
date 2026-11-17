import { type ContentType } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
    useFavoriteMutation,
    type FavoriteMutationVariables,
} from './useFavoriteMutation';
import { useFavorites } from './useFavorites';

const parsePending = (snapshot: string) =>
    new Map(
        snapshot
            .split(',')
            .filter(Boolean)
            .map((entry) => {
                const [uuid, target] = entry.split(':');
                return [uuid, target === '' ? undefined : target === '1'];
            }),
    );

/**
 * Favorite state that reflects a click immediately. The endpoint is a blind
 * toggle, so clicks on an item with a request in flight are dropped.
 */
export const useFavoriteToggle = (projectUuid: string | undefined) => {
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate } = useFavoriteMutation(projectUuid);
    const mutationCache = useQueryClient().getMutationCache();
    const subscribe = useCallback(
        (onChange: () => void) => mutationCache.subscribe(onChange),
        [mutationCache],
    );
    // A mutation stays pending until the favorites refetch settles, so the
    // star never falls back to the stale list in between.
    const getPendingSnapshot = useCallback(
        () =>
            mutationCache
                .findAll({
                    mutationKey: ['favorite_toggle', projectUuid],
                    fetching: true,
                })
                .map((mutation) => {
                    const { contentUuid, isFavorite } = mutation.state
                        .variables as unknown as FavoriteMutationVariables;
                    const target =
                        isFavorite === undefined ? '' : isFavorite ? '1' : '0';
                    return `${contentUuid}:${target}`;
                })
                .join(','),
        [mutationCache, projectUuid],
    );
    const pendingSnapshot = useSyncExternalStore(subscribe, getPendingSnapshot);
    const pending = useMemo(
        () => parsePending(pendingSnapshot),
        [pendingSnapshot],
    );
    const favoriteUuids = useMemo(
        () =>
            favorites
                ? new Set(favorites.map((item) => item.data.uuid))
                : undefined,
        [favorites],
    );

    const isFavorite = useCallback(
        (contentUuid: string) =>
            pending.get(contentUuid) ??
            favoriteUuids?.has(contentUuid) ??
            false,
        [pending, favoriteUuids],
    );
    const isPending = useCallback(
        (contentUuid: string) => pending.has(contentUuid),
        [pending],
    );
    const toggle = useCallback(
        (contentType: ContentType, contentUuid: string) => {
            // Read the cache at click time, before a render can catch up
            if (
                !favoriteUuids ||
                parsePending(getPendingSnapshot()).has(contentUuid)
            )
                return;
            mutate({
                contentType,
                contentUuid,
                isFavorite: !favoriteUuids.has(contentUuid),
            });
        },
        [favoriteUuids, getPendingSnapshot, mutate],
    );

    return {
        isFavorite,
        isPending,
        /** True until the favorites list has loaded; toggles are ignored. */
        isLoading: !favoriteUuids,
        toggle,
    };
};
