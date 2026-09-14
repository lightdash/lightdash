import {
    ContentType,
    SearchItemType,
    type RecentContentEntry,
} from '@lightdash/common';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import type { SearchItem } from '../types/searchItem';

export const getRecentContentSearchItems = (
    entries: RecentContentEntry[],
    projectUrlIdentifier: string,
): SearchItem[] =>
    entries.map(({ content }) => ({
        type:
            content.contentType === ContentType.CHART
                ? SearchItemType.CHART
                : SearchItemType.DASHBOARD,
        title: content.name,
        description: content.description ?? undefined,
        contextLabel: content.space.name,
        recentContent: content,
        icon:
            content.contentType === ContentType.CHART
                ? getChartIcon(content.chartKind)
                : undefined,
        location: {
            pathname: `/projects/${projectUrlIdentifier}/${content.contentType === ContentType.CHART ? 'saved' : 'dashboards'}/${content.slug}/view`,
        },
    }));
