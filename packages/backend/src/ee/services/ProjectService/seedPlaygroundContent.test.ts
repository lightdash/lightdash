import {
    ChartType,
    DashboardTileTypes,
    type DashboardDAO,
    type SessionUser,
} from '@lightdash/common';
import { type PlaygroundContent } from './playgroundContentTypes';
import { seedPlaygroundContent } from './seedPlaygroundContent';

const content = {
    version: 1,
    space: {
        name: 'Jaffle Shop',
        path: 'jaffle-shop',
    },
    charts: [
        {
            key: 'total-revenue',
            slug: 'total-revenue',
            name: 'Total revenue',
            description: 'Revenue received across all payment methods',
            tableName: 'payments',
            metricQuery: {
                exploreName: 'payments',
                dimensions: [],
                metrics: ['payments_total_revenue'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.BIG_NUMBER,
                config: {
                    label: 'Total revenue',
                },
            },
            tableConfig: {
                columnOrder: ['payments_total_revenue'],
            },
        },
    ],
    dashboard: {
        slug: 'jaffle-shop-overview',
        name: 'Jaffle Shop overview',
        description: 'A quick view of revenue, orders, and customers',
        filters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        tabs: [],
        tiles: [
            {
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 0,
                w: 18,
                h: 6,
                tabUuid: null,
                properties: {
                    chartKey: 'total-revenue',
                },
            },
        ],
    },
    pinned: { dashboards: ['jaffle-shop-overview'] },
    comments: [
        { chartKey: 'total-revenue', text: 'Revenue is up this month.' },
    ],
    categories: [
        { yamlReference: 'sales', name: 'Sales', color: 'blue' },
        { name: 'Weekly review', color: 'pink' },
    ],
} satisfies PlaygroundContent;

describe('seedPlaygroundContent', () => {
    it('creates normal editable content from the bundled definitions', async () => {
        const createSpace = vi.fn(async () => ({ uuid: 'space-uuid' }));
        const createChart = vi.fn();
        for (const chart of content.charts) {
            createChart.mockResolvedValueOnce({ uuid: `${chart.key}-uuid` });
        }
        const createDashboard = vi.fn(async () => ({
            uuid: 'dashboard-uuid',
            tiles: [
                {
                    uuid: 'tile-uuid',
                    type: DashboardTileTypes.SAVED_CHART,
                    x: 0,
                    y: 0,
                    w: 18,
                    h: 6,
                    tabUuid: null,
                    properties: { savedChartUuid: 'total-revenue-uuid' },
                },
            ] as DashboardDAO['tiles'],
        }));
        const user = {
            userId: 1,
            userUuid: 'user-uuid',
            firstName: 'Demo',
            lastName: 'User',
        } as SessionUser;
        const addItem = vi.fn(async () => undefined);
        const createComment = vi.fn(async () => ({}));
        const replaceYamlTags = vi.fn(async () => ({
            yamlTagsToCreateOrUpdate: [],
        }));
        const createTag = vi.fn(async () => ({ tag_uuid: 'tag-uuid' }));

        await seedPlaygroundContent({
            projectUuid: 'project-uuid',
            user,
            content,
            spaceModel: { createSpace },
            savedChartModel: { create: createChart },
            dashboardModel: { create: createDashboard },
            pinnedListModel: { addItem },
            commentModel: { createComment },
            tagsModel: { replaceYamlTags, create: createTag },
        });

        expect(createSpace).toHaveBeenCalledExactlyOnceWith(
            {
                name: 'Jaffle Shop',
                inheritParentPermissions: false,
                parentSpaceUuid: null,
            },
            {
                projectUuid: 'project-uuid',
                userId: user.userId,
                path: 'jaffle-shop',
            },
        );
        expect(createChart).toHaveBeenCalledTimes(content.charts.length);
        expect(createChart).toHaveBeenNthCalledWith(
            1,
            'project-uuid',
            user.userUuid,
            expect.objectContaining({
                name: 'Total revenue',
                spaceUuid: 'space-uuid',
                slug: 'total-revenue',
                forceSlug: true,
                updatedByUser: {
                    userUuid: user.userUuid,
                    firstName: user.firstName,
                    lastName: user.lastName,
                },
            }),
        );
        expect(createDashboard).toHaveBeenCalledExactlyOnceWith(
            'space-uuid',
            expect.objectContaining({
                name: 'Jaffle Shop overview',
                slug: 'jaffle-shop-overview',
                forceSlug: true,
                tiles: expect.arrayContaining([
                    expect.objectContaining({
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: {
                            savedChartUuid: 'total-revenue-uuid',
                        },
                    }),
                ]),
            }),
            user,
            'project-uuid',
        );
        // The pinned dashboard, the comment on the chart's tile and the
        // categories come from the same bundle.
        expect(addItem).toHaveBeenCalledExactlyOnceWith({
            projectUuid: 'project-uuid',
            dashboardUuid: 'dashboard-uuid',
        });
        expect(createComment).toHaveBeenCalledExactlyOnceWith(
            'dashboard-uuid',
            'tile-uuid',
            'Revenue is up this month.',
            '<p>Revenue is up this month.</p>',
            null,
            user,
            [],
        );
        expect(replaceYamlTags).toHaveBeenCalledExactlyOnceWith(
            'project-uuid',
            [
                {
                    project_uuid: 'project-uuid',
                    name: 'Sales',
                    color: 'blue',
                    created_by_user_uuid: 'user-uuid',
                    yaml_reference: 'sales',
                },
            ],
        );
        expect(createTag).toHaveBeenCalledExactlyOnceWith({
            project_uuid: 'project-uuid',
            name: 'Weekly review',
            color: 'pink',
            created_by_user_uuid: 'user-uuid',
            yaml_reference: null,
        });
    });
    it('seeds a prebuilt data app as a ready version with its files stored', async () => {
        const createSpace = vi.fn(async () => ({ uuid: 'space-uuid' }));
        const createChart = vi.fn(async () => ({ uuid: 'chart-uuid' }));
        const createDashboard = vi.fn(async () => ({
            uuid: 'dashboard-uuid',
            tiles: [] as DashboardDAO['tiles'],
        }));
        const createWithVersion = vi.fn(async () => ({
            app: { app_id: 'app-uuid' },
            version: { version: 1 },
        }));
        const put = vi.fn(async () => undefined);
        await seedPlaygroundContent({
            projectUuid: 'project-uuid',
            user: { userId: 1, userUuid: 'user-uuid' } as SessionUser,
            content: {
                ...content,
                charts: [],
                dashboard: { ...content.dashboard, tiles: [] },
                dataApps: [
                    {
                        key: 'pulse',
                        slug: 'pulse',
                        name: 'Pulse',
                        description: 'One page',
                        prompt: 'A one-page app',
                        files: { 'index.html': '<h1>Pulse</h1>' },
                        source: { 'src/App.tsx': 'export default () => null;' },
                    },
                ],
            },
            spaceModel: { createSpace },
            savedChartModel: { create: createChart },
            dashboardModel: { create: createDashboard },
            appModel: { createWithVersion } as never,
            appFileStore: { put },
        });
        expect(createWithVersion).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                project_uuid: 'project-uuid',
                name: 'Pulse',
                slug: 'pulse',
                space_uuid: 'space-uuid',
            }),
            { version: 1, prompt: 'A one-page app' },
            'ready',
            { images: [], charts: [], clarifications: [], dashboardName: null },
            undefined,
            undefined,
            { forceSlug: true },
        );
        expect(put).toHaveBeenCalledWith(
            'apps/app-uuid/versions/1/index.html',
            '<h1>Pulse</h1>',
            'text/html; charset=utf-8',
        );
        expect(put).toHaveBeenCalledWith(
            'apps/app-uuid/versions/1/source.tar',
            expect.any(Buffer),
            'application/x-tar',
        );
    });

    it('seeds the agent and a finished deep research run in its own thread', async () => {
        const createSpace = vi.fn(async () => ({ uuid: 'space-uuid' }));
        const createChart = vi.fn(async () => ({ uuid: 'chart-uuid' }));
        const createDashboard = vi.fn(async () => ({
            uuid: 'dashboard-uuid',
            tiles: [] as DashboardDAO['tiles'],
        }));
        const createAgent = vi.fn(async () => ({
            uuid: 'agent-uuid',
            name: 'Jaffle analyst',
        }));
        const createWebAppThreadWithPrompt = vi.fn(async () => ({
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
        }));
        const updateThreadTitle = vi.fn(async () => undefined);
        const createSeededCompletedRun = vi.fn(async () => ({}));
        await seedPlaygroundContent({
            projectUuid: 'project-uuid',
            user: {
                userId: 1,
                userUuid: 'user-uuid',
                organizationUuid: 'org-uuid',
            } as SessionUser,
            content: {
                ...content,
                charts: [],
                dashboard: { ...content.dashboard, tiles: [] },
                agent: {
                    name: 'Jaffle analyst',
                    slug: 'jaffle-analyst',
                    description: 'Answers about the shop',
                    instruction: 'Be brief',
                },
                deepResearch: {
                    prompt: 'Why did returns rise?',
                    threadTitle: 'Why returns rose',
                    resultMarkdown:
                        '# Why returns rose\n\nIntro.\n\n## One\n\nA.\n\n## Conclusion\n\nB.\n',
                    durationMs: 1000,
                    warehouseQueryCount: 2,
                },
            },
            spaceModel: { createSpace },
            savedChartModel: { create: createChart },
            dashboardModel: { create: createDashboard },
            aiAgentModel: {
                createAgent,
                createWebAppThreadWithPrompt,
                updateThreadTitle,
            } as never,
            aiDeepResearchRunModel: { createSeededCompletedRun } as never,
        });
        expect(createAgent).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
                name: 'Jaffle analyst',
                slug: 'jaffle-analyst',
                instruction: 'Be brief',
            }),
        );
        expect(createWebAppThreadWithPrompt).toHaveBeenCalledExactlyOnceWith({
            thread: {
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
                userUuid: 'user-uuid',
                createdFrom: 'web_app',
                agentUuid: 'agent-uuid',
            },
            prompt: {
                createdByUserUuid: 'user-uuid',
                prompt: 'Why did returns rise?',
            },
        });
        expect(updateThreadTitle).toHaveBeenCalledExactlyOnceWith({
            threadUuid: 'thread-uuid',
            title: 'Why returns rose',
        });
        expect(createSeededCompletedRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                agentUuid: 'agent-uuid',
                aiThreadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                warehouseQueryCount: 2,
            }),
        );
    });
});
