import {
    type ApiError,
    type HomepageRecentlyViewedItem,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import { useCollectionContent } from './useCollectionContent';

const getRecentlyViewed = async (projectUuid: string) =>
    lightdashApi<HomepageRecentlyViewedItem[]>({
        url: `/projects/${projectUuid}/homepage/recently-viewed`,
        method: 'GET',
        body: undefined,
    });

const MAX_RECENT_ITEMS = 4;

const useRecentlyViewed = (projectUuid: string) =>
    useQuery<HomepageRecentlyViewedItem[], ApiError>({
        queryKey: ['homepage_recently_viewed', projectUuid],
        queryFn: () => getRecentlyViewed(projectUuid),
    });

/** The viewer's recently-viewed content, resolved to real items. Exposed as a
 * hook so a surface that owns the section header (day-0) can decide whether to
 * render one at all — both callers share the same queries. */
export const useRecentContents = (projectUuid: string) => {
    const { data: recents, isInitialLoading } = useRecentlyViewed(projectUuid);
    const uuids = (recents ?? [])
        .slice(0, MAX_RECENT_ITEMS)
        .map((item) => item.uuid);
    const { data: contents, isInitialLoading: isResolving } =
        useCollectionContent(projectUuid, uuids);
    return {
        recents: recents ?? [],
        contents: contents ?? [],
        isLoading: isInitialLoading || isResolving,
    };
};
