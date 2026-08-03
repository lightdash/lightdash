import {
    assertUnreachable,
    collectionLimitOf,
    collectionSourceOf,
    type HomepageCollectionBlock,
    type SummaryContent,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
import { usePinnedItems } from '../../../../hooks/pinning/usePinnedItems';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../../../../hooks/useProject';
import { useCollectionContent } from './useCollectionContent';
import { useRecentContents } from './useRecentContents';

type Config = HomepageCollectionBlock['config'];

const isVerified = (content: SummaryContent) =>
    'verification' in content && !!content.verification;

/**
 * Resolves a collection block's items for the current viewer.
 *
 * Every branch goes through an endpoint that already exists, and every query
 * is access-filtered server-side — this hook never widens what a viewer can
 * see. Only the branch matching the block's source is enabled, so a manual
 * collection costs exactly what it did before sources existed.
 */
export const useCollectionSourceContent = (
    projectUuid: string,
    config: Config,
) => {
    const source = collectionSourceOf(config);
    const limit = collectionLimitOf(config);

    const manualUuids = useMemo(
        () =>
            source === 'manual'
                ? (config.items ?? []).map((item) => item.uuid)
                : [],
        [source, config.items],
    );
    const manual = useCollectionContent(projectUuid, manualUuids);

    const popular = useMostPopularAndRecentlyUpdated(
        source === 'most-viewed' || source === 'recently-updated'
            ? projectUuid
            : undefined,
    );

    const { data: project } = useProject(
        source === 'pinned' ? projectUuid : undefined,
    );
    const pinned = usePinnedItems(
        source === 'pinned' ? projectUuid : undefined,
        source === 'pinned' ? project?.pinnedListUuid : undefined,
    );

    const favorites = useFavorites(
        source === 'favorites' ? projectUuid : undefined,
    );
    const recent = useRecentContents(
        source === 'recently-viewed' ? projectUuid : undefined,
    );

    // The uuid-driven sources resolve to real content through one shared
    // endpoint, so their cards carry the same metadata manual ones do.
    const derivedUuids = useMemo(() => {
        switch (source) {
            case 'most-viewed':
                return (popular.data?.mostPopular ?? []).map(
                    (item) => item.uuid,
                );
            case 'recently-updated':
                return (popular.data?.recentlyUpdated ?? []).map(
                    (item) => item.uuid,
                );
            case 'pinned':
                return (pinned.data ?? []).map((item) => item.data.uuid);
            case 'favorites':
                // Favourites are ResourceViewItems: the uuid is on `data`.
                return (favorites.data ?? []).map((item) => item.data.uuid);
            case 'manual':
            case 'recently-viewed':
                return [];
            default:
                return assertUnreachable(source, 'Unknown collection source');
        }
    }, [source, popular.data, pinned.data, favorites.data]);

    const derived = useCollectionContent(projectUuid, derivedUuids);

    const resolved = useMemo<SummaryContent[]>(() => {
        if (source === 'manual') return manual.data ?? [];
        if (source === 'recently-viewed') return recent.contents;
        return derived.data ?? [];
    }, [source, manual.data, recent.contents, derived.data]);

    const items = useMemo(() => {
        const filtered = config.verifiedOnly
            ? resolved.filter(isVerified)
            : resolved;
        return filtered.slice(0, limit);
    }, [resolved, config.verifiedOnly, limit]);

    const isLoading =
        source === 'manual'
            ? manual.isInitialLoading
            : (source === 'recently-viewed' && recent.isLoading) ||
              popular.isInitialLoading ||
              pinned.isInitialLoading ||
              favorites.isInitialLoading ||
              derived.isInitialLoading;

    return { items, isLoading, source };
};
