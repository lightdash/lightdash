import {
    type ApiError,
    type ApiReleasesTimelineResponse,
    type Release,
    type ReleasesTimeline,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const DEFAULT_COUNT = 15;

/**
 * Fetches releases timeline from the API
 */
const getReleasesTimeline = async (
    count?: number,
    cursor?: string,
    direction?: 'before' | 'after',
): Promise<ReleasesTimeline> => {
    const params = new URLSearchParams();
    if (count) params.set('count', count.toString());
    if (cursor) params.set('cursor', cursor);
    if (direction) params.set('direction', direction);

    const queryString = params.toString();
    const url = `/releases${queryString ? `?${queryString}` : ''}`;

    return lightdashApi<ApiReleasesTimelineResponse['results']>({
        url,
        method: 'GET',
    });
};

type PageDirection = 'older' | 'newer';

type ReleasesPage = {
    releases: Release[];
    currentVersion: string;
    currentVersionFound: boolean;
    hasPrevious: boolean;
    hasNext: boolean;
    previousCursor: string | null;
    nextCursor: string | null;
    direction: PageDirection | 'initial';
};

/**
 * Hook for infinite scrolling of releases.
 * Supports bidirectional pagination (newer releases up, older releases down).
 */
export const useReleasesInfinite = () => {
    return useInfiniteQuery<ReleasesPage, ApiError>({
        queryKey: ['releases-timeline-infinite'],
        queryFn: async ({ pageParam }) => {
            const cursor = pageParam?.cursor;
            const direction = pageParam?.direction ?? 'initial';

            // Map our direction to API direction
            // 'older' = direction 'before' (get releases after cursor in timeline)
            // 'newer' = direction 'after' (get releases before cursor in timeline)
            const apiDirection =
                direction === 'older'
                    ? 'before'
                    : direction === 'newer'
                    ? 'after'
                    : undefined;

            const result = await getReleasesTimeline(
                DEFAULT_COUNT,
                cursor,
                apiDirection,
            );

            return {
                ...result,
                direction,
            };
        },
        getNextPageParam: (lastPage) => {
            // "Next" in our context means older releases (scrolling down)
            if (lastPage.hasNext && lastPage.nextCursor) {
                return {
                    cursor: lastPage.nextCursor,
                    direction: 'older' as const,
                };
            }
            return undefined;
        },
        getPreviousPageParam: (firstPage) => {
            // "Previous" in our context means newer releases (scrolling up)
            if (firstPage.hasPrevious && firstPage.previousCursor) {
                return {
                    cursor: firstPage.previousCursor,
                    direction: 'newer' as const,
                };
            }
            return undefined;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};

/**
 * Flattens the infinite query pages into a single sorted array of releases.
 * Newer releases first (top), older releases last (bottom).
 */
export const flattenReleasesPages = (
    pages: ReleasesPage[] | undefined,
): {
    releases: Release[];
    currentVersion: string;
    currentVersionFound: boolean;
} => {
    if (!pages || pages.length === 0) {
        return {
            releases: [],
            currentVersion: '',
            currentVersionFound: false,
        };
    }

    // Find the initial page for metadata
    const initialPage = pages.find((p) => p.direction === 'initial');
    const currentVersion =
        initialPage?.currentVersion ?? pages[0]?.currentVersion ?? '';
    const currentVersionFound =
        initialPage?.currentVersionFound ??
        pages[0]?.currentVersionFound ??
        false;

    // Separate pages by direction
    const newerPages = pages.filter((p) => p.direction === 'newer').reverse();
    const initialPages = pages.filter((p) => p.direction === 'initial');
    const olderPages = pages.filter((p) => p.direction === 'older');

    // Combine in order: newer (top) -> initial -> older (bottom)
    const allReleases: Release[] = [];
    const seenVersions = new Set<string>();

    for (const page of [...newerPages, ...initialPages, ...olderPages]) {
        for (const release of page.releases) {
            if (!seenVersions.has(release.version)) {
                seenVersions.add(release.version);
                allReleases.push(release);
            }
        }
    }

    return {
        releases: allReleases,
        currentVersion,
        currentVersionFound,
    };
};
