import { ChartType, DashboardTileTypes } from '@lightdash/common';
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
} satisfies PlaygroundContent;

describe('seedPlaygroundContent', () => {
    it('creates normal editable content from the bundled definitions', async () => {
        const createSpace = vi.fn(async () => ({ uuid: 'space-uuid' }));
        const createChart = vi.fn();
        for (const chart of content.charts) {
            createChart.mockResolvedValueOnce({ uuid: `${chart.key}-uuid` });
        }
        const createDashboard = vi.fn(async () => ({}));
        const user = {
            userId: 1,
            userUuid: 'user-uuid',
            firstName: 'Demo',
            lastName: 'User',
        };

        await seedPlaygroundContent({
            projectUuid: 'project-uuid',
            user,
            content,
            spaceModel: { createSpace },
            savedChartModel: { create: createChart },
            dashboardModel: { create: createDashboard },
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
    });
});
