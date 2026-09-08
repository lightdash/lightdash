import {
    RoadmapItemPriority,
    RoadmapItemStatus,
    type RoadmapItem,
    type RoadmapProject,
    type RoadmapProjectQuery,
    type RoadmapProjectResults,
    type RoadmapProjectRequestsResults,
} from '@lightdash/common';
import { type RoadmapApi } from './roadmapApi';
import {
    ticketStage,
    type RoadmapProjectPresentation,
} from './roadmapPresentation';

export type RoadmapMockScenario =
    | 'populated'
    | 'empty'
    | 'loading'
    | 'error'
    | 'unavailable'
    | 'removed'
    | 'missing-title'
    | 'pagination'
    | 'expiry';

const mockProjectPresentation: Record<string, RoadmapProjectPresentation> = {
    'ai-exploration': {
        stage: 'started',
        icon: 'sparkles',
        progress: 42,
        priority: RoadmapItemPriority.HIGH,
    },
    'dashboard-filters': {
        stage: 'started',
        icon: 'filter',
        progress: 68,
        priority: RoadmapItemPriority.HIGH,
    },
    metrics: {
        stage: 'planned',
        icon: 'chart',
        progress: 12,
        priority: RoadmapItemPriority.MEDIUM,
    },
    performance: {
        stage: 'planned',
        icon: 'bolt',
        progress: 8,
        priority: RoadmapItemPriority.URGENT,
    },
    scheduling: {
        stage: 'backlog',
        icon: 'calendar',
        progress: 0,
        priority: RoadmapItemPriority.LOW,
    },
    'recently-shipped': {
        stage: 'completed',
        icon: 'bolt',
        progress: 100,
        priority: RoadmapItemPriority.HIGH,
    },
    'self-serve': {
        stage: 'paused',
        icon: 'users',
        progress: 24,
        priority: RoadmapItemPriority.NO_PRIORITY,
    },
    'metric-governance': {
        stage: 'backlog',
        icon: 'chart',
        progress: 0,
        priority: RoadmapItemPriority.HIGH,
    },
    'dashboard-history': {
        stage: 'planned',
        icon: 'folder',
        progress: 5,
        priority: RoadmapItemPriority.MEDIUM,
    },
    subscriptions: {
        stage: 'backlog',
        icon: 'calendar',
        progress: 0,
        priority: RoadmapItemPriority.LOW,
    },
    ...Object.fromEntries(
        Array.from({ length: 18 }, (_, i) => [
            `example-${i}`,
            {
                stage: 'backlog',
                icon: 'folder',
                progress: 0,
                priority: RoadmapItemPriority.NO_PRIORITY,
            } as RoadmapProjectPresentation,
        ]),
    ),
};

const projects: RoadmapProject[] = [
    { projectId: 'ai-exploration', title: 'AI-powered data exploration' },
    {
        projectId: 'dashboard-filters',
        title: 'More flexible dashboard filters',
    },
    { projectId: 'metrics', title: 'A single home for your metrics' },
    { projectId: 'recently-shipped', title: 'Instant dashboard previews' },
    { projectId: 'performance', title: 'Faster dashboards at any scale' },
    {
        projectId: 'scheduling',
        title: 'Scheduled reports that fit your workflow',
    },
    { projectId: 'self-serve', title: 'Self-serve analytics for everyone' },
    { projectId: 'metric-governance', title: 'Governed metric definitions' },
    { projectId: 'dashboard-history', title: 'Version history for dashboards' },
    { projectId: 'subscriptions', title: 'Smarter dashboard subscriptions' },
].map((project) => ({
    ...project,
    ...mockProjectPresentation[project.projectId],
}));

function request(
    id: number,
    title: string,
    status: RoadmapItemStatus,
    description: string,
): RoadmapItem {
    return {
        ticketId: `DEMO-${id}`,
        title,
        status,
        description,
        priority: [
            RoadmapItemPriority.HIGH,
            RoadmapItemPriority.MEDIUM,
            RoadmapItemPriority.LOW,
        ][(id - 1) % 3],
        createdAt: '2026-08-01T10:00:00Z',
        updatedAt: '2026-09-07T14:30:00Z',
        issueUrl: `https://github.com/lightdash/lightdash/issues/${27151 + id}`,
        pullRequestUrl: null,
    };
}
const requests = [
    {
        projectId: 'dashboard-filters',
        request: request(
            1,
            'Apply one date filter across every dashboard tab',
            RoadmapItemStatus.BUILDING,
            'Set a date range once and use it across the entire dashboard.\n\nThis request helps teams compare results without adjusting the same filter on each tab.',
        ),
    },
    {
        projectId: 'dashboard-filters',
        request: request(
            2,
            'Save personal filter defaults',
            RoadmapItemStatus.BACKLOG,
            'Remember the filters you use most, so each dashboard opens with a useful starting point.',
        ),
    },
    {
        projectId: 'dashboard-filters',
        request: request(
            3,
            'Filter dashboards by several values at once',
            RoadmapItemStatus.SHIPPED,
            'Select multiple regions, teams, or products in a single filter.',
        ),
    },
    {
        projectId: 'ai-exploration',
        request: request(
            4,
            'Ask follow-up questions about a chart',
            RoadmapItemStatus.BUILDING,
            'Continue exploring from a chart without restating the original question.\n\n### Expected experience\nKeep the context of the current chart when asking a follow-up question.',
        ),
    },
    {
        projectId: 'performance',
        request: request(
            5,
            'Reuse query results across dashboard tiles',
            RoadmapItemStatus.BACKLOG,
            'Reduce repeated queries when several tiles use the same data.',
        ),
    },
    {
        projectId: null,
        request: request(
            6,
            'Export tables with their number formatting',
            RoadmapItemStatus.BACKLOG,
            'Keep currency, percentage, and decimal formatting when exporting a table.',
        ),
    },
    {
        projectId: null,
        request: request(
            7,
            'Choose a default timezone for scheduled deliveries',
            RoadmapItemStatus.BUILDING,
            'Use one timezone consistently across scheduled deliveries.',
        ),
    },
    {
        projectId: 'dashboard-filters',
        request: request(
            8,
            'Set workspace-wide filter defaults',
            RoadmapItemStatus.BUILDING,
            'A ticket the current user does not follow.',
        ),
    },
    {
        projectId: 'dashboard-filters',
        request: request(
            9,
            'Cascade filters automatically',
            RoadmapItemStatus.CANCELED,
            'This approach was replaced with explicit filter controls.',
        ),
    },
    {
        projectId: 'dashboard-history',
        request: request(
            10,
            'Restore a previous dashboard version',
            RoadmapItemStatus.BACKLOG,
            'Browse earlier versions of a dashboard and restore its charts, layout, and filters.',
        ),
    },
    {
        projectId: 'dashboard-history',
        request: request(
            11,
            'Compare changes between dashboard versions',
            RoadmapItemStatus.BACKLOG,
            'See which charts and settings changed before restoring or publishing a dashboard.',
        ),
    },
    ...[
        [
            'Export dashboard tables to Excel',
            'Download an Excel workbook with a separate sheet for each table on the dashboard.',
        ],
        [
            'Add reference lines to time-series charts',
            'Mark a target or important date on a chart so changes have more context.',
        ],
        [
            'Keep column widths when saving a table',
            'Remember resized columns when saving and reopening a chart.',
        ],
        [
            'Search for values in long filter lists',
            'Find the right value quickly when a filter contains hundreds of options.',
        ],
        [
            'Copy a chart as an image',
            'Copy a chart to the clipboard to share it in a document or presentation.',
        ],
        [
            'Choose custom colors for individual series',
            'Assign a consistent color to each series so charts match the team’s reporting conventions.',
        ],
    ].map(([title, description], index) => ({
        projectId: null,
        request: request(
            12 + index,
            title,
            RoadmapItemStatus.BACKLOG,
            description,
        ),
    })),
    {
        projectId: null,
        request: request(
            18,
            'Send a separate email for each dashboard tab',
            RoadmapItemStatus.CANCELED,
            'This approach was canceled in favor of one scheduled delivery with selectable dashboard tabs, keeping related reports together.',
        ),
    },
    ...[
        [
            'Pin favorite dashboards',
            'Keep frequently used dashboards at the top of your home page.',
        ],
        [
            'Add notes to chart data points',
            'Explain important changes with annotations directly on a chart.',
        ],
        [
            'Format negative values with parentheses',
            'Use accounting-style formatting in tables and summary values.',
        ],
        [
            'Compare two custom date ranges',
            'Compare results across independently selected time periods.',
        ],
        [
            'Display totals above stacked bars',
            'Show the combined value of each stacked bar.',
        ],
        [
            'Reorder dashboard tabs',
            'Drag dashboard tabs into the order that works for your team.',
        ],
        [
            'Add descriptions to saved filters',
            'Explain when and how to use a shared filter.',
        ],
        [
            'Search chart descriptions',
            'Find relevant charts using the context in their descriptions.',
        ],
        [
            'Download charts as SVG',
            'Export sharp, scalable charts for reports and presentations.',
        ],
        [
            'Set a minimum chart axis value',
            'Choose where an axis starts to make comparisons easier to read.',
        ],
    ].map(([title, description], index) => ({
        projectId: null,
        request: request(
            50 + index,
            title,
            RoadmapItemStatus.BACKLOG,
            description,
        ),
    })),
];

function paginate<T>(items: T[], query: RoadmapProjectQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return {
        items: items.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
            page,
            pageSize,
            totalResults: items.length,
            totalPages: Math.ceil(items.length / pageSize),
        },
    };
}

export function createRoadmapMockApi(
    scenario: RoadmapMockScenario,
    latency = 400,
): RoadmapApi {
    const startedAt = Date.now();
    let expiresAt = new Date(
        startedAt + (scenario === 'expiry' ? 12_000 : 600_000),
    ).toISOString();
    let errorReturned = false;
    let visibleProjects = scenario === 'empty' ? [] : projects;
    if (scenario === 'removed' || scenario === 'missing-title')
        visibleProjects = projects.filter(
            (project) => project.projectId !== 'dashboard-filters',
        );
    if (scenario === 'pagination')
        visibleProjects = [
            ...projects,
            ...Array.from({ length: 18 }, (_, i) => ({
                ...mockProjectPresentation[`example-${i}`],
                projectId: `example-${i}`,
                title: `Example project ${String(i + 1).padStart(2, '0')}`,
            })),
        ];
    const followedTicketIds = new Set([
        'DEMO-1',
        'DEMO-2',
        'DEMO-3',
        'DEMO-4',
        'DEMO-5',
        'DEMO-6',
        'DEMO-7',
        'DEMO-9',
        ...Array.from({ length: 9 }, (_, index) => `DEMO-${10 + index}`),
        ...Array.from({ length: 10 }, (_, index) => `DEMO-${50 + index}`),
    ]);
    const followedRequests = requests.filter((item) =>
        followedTicketIds.has(item.request.ticketId),
    );
    if (scenario === 'pagination')
        followedRequests.push(
            ...Array.from({ length: 22 }, (_, i) => ({
                projectId: 'dashboard-filters',
                request: request(
                    20 + i,
                    `Followed filter improvement ${i + 1}`,
                    RoadmapItemStatus.BACKLOG,
                    'An additional followed ticket for pagination review.',
                ),
            })),
        );
    const ids = new Set(visibleProjects.map((project) => project.projectId));
    const visibleRequests =
        scenario === 'empty'
            ? []
            : followedRequests.map((item) => ({
                  ...item,
                  projectId:
                      item.projectId && ids.has(item.projectId)
                          ? item.projectId
                          : null,
              }));
    const beforeRead = async () => {
        if (scenario === 'loading') return new Promise<void>(() => {});
        if (scenario !== 'expiry' && Date.now() >= Date.parse(expiresAt))
            expiresAt = new Date(Date.now() + 600_000).toISOString();
        await new Promise<void>((resolve) =>
            window.setTimeout(resolve, latency),
        );
        if (
            scenario === 'unavailable' ||
            (scenario === 'error' && !errorReturned) ||
            (scenario === 'expiry' && Date.now() >= Date.parse(expiresAt))
        ) {
            errorReturned = true;
            throw {
                status: 'error',
                error: {
                    name: 'RoadmapUnavailable',
                    statusCode: scenario === 'unavailable' ? 403 : 502,
                    message: 'Mock roadmap request failed',
                },
            };
        }
    };
    return {
        getProjects: async (query): Promise<RoadmapProjectResults> => {
            await beforeRead();
            const search = query.search?.trim().toLowerCase() ?? '';
            const matchesFilters = (stage: string, priority: string) =>
                (!query.statuses ||
                    query.statuses.split(',').includes(stage)) &&
                (!query.priorities ||
                    query.priorities.split(',').includes(priority));
            const groups = visibleProjects
                .filter((project) =>
                    matchesFilters(project.stage, project.priority),
                )
                .filter(
                    (project) =>
                        project.title.toLowerCase().includes(search) ||
                        visibleRequests.some(
                            (item) =>
                                item.projectId === project.projectId &&
                                item.request.title
                                    .toLowerCase()
                                    .includes(search),
                        ),
                )
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((project) => ({
                    project,
                    ownRequestCount: visibleRequests.filter(
                        (item) => item.projectId === project.projectId,
                    ).length,
                    hasDirectNeed: ['dashboard-filters', 'metrics'].includes(
                        project.projectId,
                    ),
                }))
                .filter(
                    (group) =>
                        !query.onlyInterested ||
                        group.hasDirectNeed ||
                        group.ownRequestCount > 0,
                );
            const page = paginate(groups, query);
            return {
                projects: page.items,
                pagination: page.pagination,
                otherRequestCount: visibleRequests.filter(
                    (item) =>
                        item.projectId === null &&
                        matchesFilters(
                            ticketStage(item.request.status),
                            item.request.priority,
                        ) &&
                        item.request.title.toLowerCase().includes(search),
                ).length,
                expiresAt,
            };
        },
        getRequests: async (query): Promise<RoadmapProjectRequestsResults> => {
            await beforeRead();
            const groupId = query.groupId === 'other' ? null : query.groupId;
            const search = query.search?.trim().toLowerCase() ?? '';
            const items = visibleRequests.filter(
                (item) =>
                    item.projectId === groupId &&
                    (!query.statuses ||
                        query.statuses
                            .split(',')
                            .includes(ticketStage(item.request.status))) &&
                    (!query.priorities ||
                        query.priorities
                            .split(',')
                            .includes(item.request.priority)) &&
                    item.request.title.toLowerCase().includes(search),
            );
            const page = paginate(items, query);
            return {
                requests: page.items,
                pagination: page.pagination,
                expiresAt,
            };
        },
    };
}
