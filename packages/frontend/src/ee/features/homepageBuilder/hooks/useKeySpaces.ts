import {
    ContentType,
    type SpaceContent,
    type SummaryContent,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useInfiniteContent } from '../../../../hooks/useContent';
import { useMostPopularAndRecentlyUpdated } from '../../../../hooks/useProject';
import { rankKeySpaces, type KeySpace } from './rankKeySpaces';

// Enough to rank meaningfully without paging: a project with more spaces than
// this has plenty of signal in the first page either way.
const SPACE_SCAN_SIZE = 100;

const isSpace = (content: SummaryContent): content is SpaceContent =>
    content.contentType === ContentType.SPACE;

/**
 * The spaces day-0 leads with. Ranking rules live in `rankKeySpaces`.
 *
 * Both queries already run on the project home page, so this adds no requests
 * of its own — the space list is the same one the content API serves to browse,
 * and most-popular is already fetched for the legacy panel.
 */
export const useKeySpaces = (
    projectUuid: string | undefined,
    limit: number,
) => {
    const spacesQuery = useInfiniteContent(
        {
            projectUuids: projectUuid ? [projectUuid] : [],
            contentTypes: [ContentType.SPACE],
            pageSize: SPACE_SCAN_SIZE,
        },
        { enabled: !!projectUuid },
    );
    const popularQuery = useMostPopularAndRecentlyUpdated(projectUuid);

    const spaces = useMemo<KeySpace[]>(() => {
        const all = (spacesQuery.data?.pages ?? [])
            .flatMap((page) => page.data)
            .filter(isSpace);
        if (all.length === 0) return [];

        // Views of the most-viewed content, summed onto the space holding it.
        const viewsBySpace = new Map<string, number>();
        (popularQuery.data?.mostPopular ?? []).forEach((item) => {
            const views = 'views' in item ? (item.views ?? 0) : 0;
            viewsBySpace.set(
                item.spaceUuid,
                (viewsBySpace.get(item.spaceUuid) ?? 0) + views,
            );
        });

        return rankKeySpaces(
            all.map((space) => ({
                uuid: space.uuid,
                name: space.name,
                dashboardCount: space.dashboardCount,
                chartCount: space.chartCount,
                appCount: space.appCount,
                isPinned: space.pinnedList !== null,
            })),
            viewsBySpace,
            limit,
        );
    }, [spacesQuery.data?.pages, popularQuery.data?.mostPopular, limit]);

    return { spaces, isLoading: spacesQuery.isInitialLoading };
};
