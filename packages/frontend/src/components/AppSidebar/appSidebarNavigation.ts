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
    | 'metrics';

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
]);

const PROJECT_ROUTE_SEGMENT = /^\/projects\/[^/]+\/([^/]+)/;

export const getActiveAppSidebarItem = (
    pathname: string,
): AppSidebarItemKey | null => {
    const segment = pathname.match(PROJECT_ROUTE_SEGMENT)?.[1];
    if (segment === undefined) return null;
    return ITEM_KEY_BY_ROUTE_SEGMENT.get(segment) ?? null;
};
