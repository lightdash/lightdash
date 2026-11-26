export const APP_SIDEBAR_ID = 'app-sidebar';

type AppSidebarSectionKey = 'main' | 'content' | 'explore' | 'quality';

export const APP_SIDEBAR_SECTIONS: {
    key: AppSidebarSectionKey;
    label: string | null;
}[] = [
    { key: 'main', label: null },
    { key: 'content', label: 'Content' },
    { key: 'explore', label: 'Explore' },
    { key: 'quality', label: 'Quality' },
];

type AppSidebarItemDefinition = {
    section: AppSidebarSectionKey;
    label: string;
    /** The route segment after the project, which also marks the row active. */
    segment: string;
    /** Some pages are only routed by the project's uuid, never its slug. */
    addressedBy: 'urlIdentifier' | 'uuid';
    /** The name walkthroughs know this destination by. */
    tourNav: string;
};

/** Every sidebar destination, in the order it is listed. */
export const APP_SIDEBAR_ITEMS = {
    home: {
        section: 'main',
        label: 'Home',
        segment: 'home',
        addressedBy: 'urlIdentifier',
        tourNav: 'home',
    },
    askAi: {
        section: 'main',
        label: 'Ask AI',
        segment: 'ai-agents',
        addressedBy: 'uuid',
        tourNav: 'ask-ai',
    },
    spaces: {
        section: 'content',
        label: 'Spaces',
        segment: 'spaces',
        addressedBy: 'urlIdentifier',
        tourNav: 'all-spaces',
    },
    dashboards: {
        section: 'content',
        label: 'Dashboards',
        segment: 'dashboards',
        addressedBy: 'urlIdentifier',
        tourNav: 'all-dashboards',
    },
    charts: {
        section: 'content',
        label: 'Charts',
        segment: 'saved',
        addressedBy: 'urlIdentifier',
        tourNav: 'all-charts',
    },
    documents: {
        section: 'content',
        label: 'Documents',
        segment: 'documents',
        addressedBy: 'urlIdentifier',
        tourNav: 'all-documents',
    },
    dataApps: {
        section: 'content',
        label: 'Data apps',
        segment: 'apps',
        addressedBy: 'uuid',
        tourNav: 'all-apps',
    },
    tables: {
        section: 'explore',
        label: 'Tables',
        segment: 'tables',
        addressedBy: 'urlIdentifier',
        tourNav: 'new-chart',
    },
    sqlRunner: {
        section: 'explore',
        label: 'SQL runner',
        segment: 'sql-runner',
        addressedBy: 'urlIdentifier',
        tourNav: 'new-sql-runner',
    },
    metrics: {
        section: 'explore',
        label: 'Metrics',
        segment: 'metrics',
        addressedBy: 'urlIdentifier',
        tourNav: 'metrics',
    },
    semanticLayer: {
        section: 'explore',
        label: 'Semantic layer',
        segment: 'semantic-layer',
        addressedBy: 'uuid',
        tourNav: 'semantic-layer',
    },
    chartStudio: {
        section: 'explore',
        label: 'Chart Studio',
        segment: 'chart-studio',
        addressedBy: 'urlIdentifier',
        tourNav: 'chart-studio',
    },
    reviews: {
        section: 'quality',
        label: 'Reviews',
        segment: 'review-requests',
        addressedBy: 'uuid',
        tourNav: 'reviews',
    },
    autopilot: {
        section: 'quality',
        label: 'Autopilot',
        segment: 'autopilot',
        addressedBy: 'uuid',
        tourNav: 'autopilot',
    },
} as const satisfies Record<string, AppSidebarItemDefinition>;

export type AppSidebarItemKey = keyof typeof APP_SIDEBAR_ITEMS;

export const APP_SIDEBAR_ITEM_KEYS = Object.keys(
    APP_SIDEBAR_ITEMS,
) as AppSidebarItemKey[];

export const getAppSidebarItemUrl = (
    key: AppSidebarItemKey,
    project: { projectUuid: string; projectUrlIdentifier: string },
): string => {
    const { segment, addressedBy } = APP_SIDEBAR_ITEMS[key];
    const identifier =
        addressedBy === 'uuid'
            ? project.projectUuid
            : project.projectUrlIdentifier;
    return `/projects/${identifier}/${segment}`;
};

const PROJECT_ROUTE_SEGMENT = /^\/projects\/[^/]+\/([^/]+)/;

export const getActiveAppSidebarItem = (
    pathname: string,
): AppSidebarItemKey | null => {
    const segment = pathname.match(PROJECT_ROUTE_SEGMENT)?.[1];
    return (
        APP_SIDEBAR_ITEM_KEYS.find(
            (key) => APP_SIDEBAR_ITEMS[key].segment === segment,
        ) ?? null
    );
};
