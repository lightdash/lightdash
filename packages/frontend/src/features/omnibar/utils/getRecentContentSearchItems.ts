import {
    ContentType,
    SearchItemType,
    type RecentContentEntry,
} from '@lightdash/common';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import type { SearchItem } from '../types/searchItem';

const SEARCH_ITEM_TYPES = {
    [ContentType.CHART]: SearchItemType.CHART,
    [ContentType.DASHBOARD]: SearchItemType.DASHBOARD,
    [ContentType.DATA_APP]: SearchItemType.DATA_APP,
};

export const getRecentContentSearchItems = (
    entries: RecentContentEntry[],
    projectUrlIdentifier: string,
): SearchItem[] =>
    entries.map(({ content }) => ({
        type: SEARCH_ITEM_TYPES[content.contentType],
        title: content.name,
        description: content.description ?? undefined,
        contextLabel: content.space?.name,
        recentContent: content,
        icon:
            content.contentType === ContentType.CHART
                ? getChartIcon(content.chartKind)
                : undefined,
        location: {
            pathname:
                content.contentType === ContentType.DATA_APP
                    ? `/projects/${projectUrlIdentifier}/apps/${content.uuid}/view`
                    : `/projects/${projectUrlIdentifier}/${content.contentType === ContentType.CHART ? 'saved' : 'dashboards'}/${content.slug}/view`,
        },
    }));
