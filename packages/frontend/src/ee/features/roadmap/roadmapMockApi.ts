import {
    RoadmapItemPriority,
    RoadmapItemStatus,
    type RoadmapItem,
    type RoadmapResults,
    type RoadmapProject,
    type RoadmapProjectQuery,
    type RoadmapProjectResults,
    type RoadmapProjectRequestsResults,
} from '@lightdash/common';
import { getRoadmapFacets } from '../../pages/roadmapUtils';
import { type RoadmapApi } from './roadmapApi';
import { type RoadmapProjectPresentation } from './roadmapPresentation';

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

export const mockProjectPresentation: Record<
    string,
    RoadmapProjectPresentation
> = {
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
    'self-serve': {
        stage: 'paused',
        icon: 'users',
        progress: 24,
        priority: RoadmapItemPriority.NO_PRIORITY,
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
    { projectId: 'performance', title: 'Faster dashboards at any scale' },
    {
        projectId: 'scheduling',
        title: 'Scheduled reports that fit your workflow',
    },
    { projectId: 'self-serve', title: 'Self-serve analytics for everyone' },
];

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
    const expiresAt = new Date(
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
    ]);
    const followedRequests = requests.filter((item) =>
        followedTicketIds.has(item.request.ticketId),
    );
    if (scenario === 'pagination')
        followedRequests.push(
            ...Array.from({ length: 12 }, (_, i) => ({
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
            const groups = visibleProjects
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
                }));
            const page = paginate(groups, query);
            return {
                projects: page.items,
                pagination: page.pagination,
                otherRequestCount: visibleRequests.filter(
                    (item) =>
                        item.projectId === null &&
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

export default async function getLegacyRoadmapMock(): Promise<RoadmapResults> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
    const data = requests.map((item) => item.request);
    return {
        data,
        facets: getRoadmapFacets(data),
        pagination: {
            page: 1,
            pageSize: 100,
            totalIssues: data.length,
            totalPages: 1,
        },
    };
}
