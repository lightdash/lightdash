import {
    ChartType,
    type AiPromptContext,
    type Explore,
    type SavedChart,
} from '@lightdash/common';
import {
    buildChartSuggestionContext,
    buildDashboardSuggestionContext,
    getPinnedSuggestionContextInput,
} from './suggestionPinnedContext';

const chart = {
    name: 'Revenue by status',
    description: 'Revenue split by order status',
    chartConfig: { type: ChartType.CARTESIAN },
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total_revenue'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
} satisfies Pick<
    SavedChart,
    'name' | 'description' | 'chartConfig' | 'metricQuery'
>;

const explores = [
    {
        name: 'orders',
        tables: {
            orders: {
                dimensions: {
                    status: {
                        name: 'status',
                        table: 'orders',
                        label: 'Order status',
                    },
                },
                metrics: {
                    totalRevenue: {
                        name: 'total_revenue',
                        table: 'orders',
                        label: 'Total revenue',
                    },
                },
            },
        },
    },
] as unknown as Explore[];

describe('suggestion pinned context', () => {
    it('builds chart context from saved fields and metadata', () => {
        expect(buildChartSuggestionContext(chart, explores)).toEqual({
            type: 'chart',
            name: 'Revenue by status',
            description: 'Revenue split by order status',
            fields: [
                {
                    id: 'orders_status',
                    label: 'Order status',
                    kind: 'dimension',
                },
                {
                    id: 'orders_total_revenue',
                    label: 'Total revenue',
                    kind: 'metric',
                },
            ],
            metadata: {
                chartType: ChartType.CARTESIAN,
                exploreName: 'orders',
                runtimeOverrides: null,
            },
        });
    });

    it('aggregates dashboard chart fields and metadata', () => {
        const result = buildDashboardSuggestionContext(
            {
                name: 'Revenue overview',
                description: 'Commercial performance',
                tabs: [{ name: 'Summary' }],
            } as Parameters<typeof buildDashboardSuggestionContext>[0],
            [chart],
            explores,
        );

        expect(result).toMatchObject({
            type: 'dashboard',
            name: 'Revenue overview',
            fields: [
                { id: 'orders_status', label: 'Order status' },
                { id: 'orders_total_revenue', label: 'Total revenue' },
            ],
            metadata: {
                chartNames: ['Revenue by status'],
                chartTypes: [ChartType.CARTESIAN],
                exploreNames: ['orders'],
                tabNames: ['Summary'],
            },
        });
    });

    it('reuses the latest persisted chart or dashboard pin from a thread', () => {
        const oldContext: AiPromptContext = [
            {
                type: 'chart',
                chartUuid: 'chart-1',
                chartSlug: 'old-chart',
                pinnedVersionUuid: null,
                displayName: 'Old chart',
                runtimeOverrides: null,
                chartKind: null,
            },
        ];
        const latestContext: AiPromptContext = [
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                dashboardSlug: 'latest-dashboard',
                pinnedVersionUuid: null,
                displayName: 'Latest dashboard',
                runtimeOverrides: null,
            },
        ];

        expect(
            getPinnedSuggestionContextInput([
                { role: 'user', context: oldContext },
                { role: 'assistant' },
                { role: 'user', context: latestContext },
            ]),
        ).toEqual([{ type: 'dashboard', dashboardUuid: 'dashboard-1' }]);
    });
});
