import {
    assertUnreachable,
    getDocumentUrl,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    IconAppWindow,
    IconChartAreaLine,
    IconFileText,
    IconFolder,
    IconLayoutDashboard,
} from '@tabler/icons-react';

const FAVORITE_ROUTE_SEGMENT: Record<ResourceViewItemType, string> = {
    [ResourceViewItemType.DASHBOARD]: 'dashboards',
    [ResourceViewItemType.CHART]: 'saved',
    [ResourceViewItemType.SPACE]: 'spaces',
    [ResourceViewItemType.DATA_APP]: 'apps',
    [ResourceViewItemType.DOCUMENT]: 'documents',
};

export const getFavoriteItemUrl = (
    projectUuid: string,
    projectUrlIdentifier: string,
    item: ResourceViewItem,
) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUrlIdentifier}/${FAVORITE_ROUTE_SEGMENT[item.type]}/${item.data.slug}/view`;
        case ResourceViewItemType.CHART:
            return `/projects/${projectUrlIdentifier}/${FAVORITE_ROUTE_SEGMENT[item.type]}/${item.data.slug}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUrlIdentifier}/${FAVORITE_ROUTE_SEGMENT[item.type]}/${item.data.uuid}`;
        case ResourceViewItemType.DATA_APP:
            return `/projects/${projectUuid}/${FAVORITE_ROUTE_SEGMENT[item.type]}/${item.data.uuid}/view`;
        case ResourceViewItemType.DOCUMENT:
            return getDocumentUrl(
                projectUrlIdentifier,
                item.data.uuid,
                item.data.slug,
            );
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

export const getFavoriteItemIcon = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return IconLayoutDashboard;
        case ResourceViewItemType.CHART:
            return IconChartAreaLine;
        case ResourceViewItemType.SPACE:
            return IconFolder;
        case ResourceViewItemType.DATA_APP:
            return IconAppWindow;
        case ResourceViewItemType.DOCUMENT:
            return IconFileText;
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

const PROJECT_ITEM_ROUTE = /^\/projects\/[^/]+\/([^/]+)\/([^/]+)/;

/** The favorite whose page, or a page below it, is being viewed. */
export const getActiveFavoriteUuid = (
    pathname: string,
    favorites: ResourceViewItem[],
): string | null => {
    const match = pathname.match(PROJECT_ITEM_ROUTE);
    if (!match) return null;
    const [, segment, rawIdentifier] = match;
    const identifier = decodeURIComponent(rawIdentifier);
    const active = favorites.find(
        (item) =>
            FAVORITE_ROUTE_SEGMENT[item.type] === segment &&
            // Pages are addressed by slug or by uuid, depending on the link.
            (item.data.uuid === identifier ||
                ('slug' in item.data && item.data.slug === identifier)),
    );
    return active?.data.uuid ?? null;
};
