import { ResourceViewItemType, type ResourceViewItem } from '@lightdash/common';

export const APP_SIDEBAR_ID = 'app-sidebar';

export type AppSidebarItemKey =
    | 'home'
    | 'askAi'
    | 'spaces'
    | 'dashboards'
    | 'charts'
    | 'documents'
    | 'dataApps'
    | 'tables'
    | 'sqlRunner'
    | 'metrics'
    | 'semanticLayer'
    | 'chartStudio'
    | 'reviews'
    | 'autopilot';

const ITEM_KEY_BY_ROUTE_SEGMENT = new Map<string, AppSidebarItemKey>([
    ['home', 'home'],
    ['ai-agents', 'askAi'],
    ['spaces', 'spaces'],
    ['dashboards', 'dashboards'],
    ['saved', 'charts'],
    ['documents', 'documents'],
    ['apps', 'dataApps'],
    ['tables', 'tables'],
    ['sql-runner', 'sqlRunner'],
    ['metrics', 'metrics'],
    ['semantic-layer', 'semanticLayer'],
    ['chart-studio', 'chartStudio'],
    ['review-requests', 'reviews'],
    ['autopilot', 'autopilot'],
]);

const PROJECT_ROUTE_SEGMENT = /^\/projects\/[^/]+\/([^/]+)/;

export const getActiveAppSidebarItem = (
    pathname: string,
): AppSidebarItemKey | null => {
    const segment = pathname.match(PROJECT_ROUTE_SEGMENT)?.[1];
    if (segment === undefined) return null;
    return ITEM_KEY_BY_ROUTE_SEGMENT.get(segment) ?? null;
};

const FAVORITE_ROUTE_SEGMENT: Record<ResourceViewItemType, string> = {
    [ResourceViewItemType.DASHBOARD]: 'dashboards',
    [ResourceViewItemType.CHART]: 'saved',
    [ResourceViewItemType.SPACE]: 'spaces',
    [ResourceViewItemType.DATA_APP]: 'apps',
    [ResourceViewItemType.DOCUMENT]: 'documents',
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
