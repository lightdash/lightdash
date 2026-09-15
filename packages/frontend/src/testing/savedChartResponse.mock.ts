import { ChartType, type SavedChart } from '@lightdash/common';

/** Matches the default user fixture's organization (mockUserResponse). */
const ORGANIZATION_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';

/** Ability rule granting manage on every chart in the mock organization. */
export const manageChartRule = {
    action: 'manage',
    subject: 'SavedChart',
    conditions: { organizationUuid: ORGANIZATION_UUID },
} as const;

export function mockSavedChartResponse(
    overrides: Partial<SavedChart> = {},
): SavedChart {
    return {
        uuid: 'chart-uuid',
        slug: 'revenue-per-payment-method',
        projectUuid: 'project-uuid',
        organizationUuid: ORGANIZATION_UUID,
        name: 'Revenue per payment method',
        description: '',
        tableName: 'payments',
        metricQuery: {
            exploreName: 'payments',
            dimensions: ['payments_payment_method'],
            metrics: ['payments_total_revenue'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'payments_payment_method', yField: [] },
                eChartsConfig: { series: [] },
            },
        },
        tableConfig: { columnOrder: [] },
        pivotConfig: undefined,
        colorPaletteUuid: 'palette-uuid',
        access: [],
        ...overrides,
    } as unknown as SavedChart;
}
