import {
    DBFieldTypes,
    FieldImpactSeverity,
    ForbiddenError,
    toolAnalyzeFieldImpactOutputSchema,
    type FieldImpactReport,
} from '@lightdash/common';
import { getAnalyzeFieldImpact } from './analyzeFieldImpact';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const execute = async (
    tool: ReturnType<typeof getAnalyzeFieldImpact>,
    fieldId: string,
) => {
    const { execute: run } = tool;
    if (!run) throw new Error('analyzeFieldImpact tool has no execute');
    return run({ fieldId }, { messages: [], toolCallId: 'tool-call-1' });
};

const emptyReport: FieldImpactReport = {
    projectUuid: 'project-1',
    fieldId: 'orders_total_revenue',
    fieldType: null,
    severity: FieldImpactSeverity.Safe,
    summary: {
        charts: 0,
        dashboards: 0,
        dashboardFilterTargets: 0,
        metricTreeDependents: 0,
        scheduledDeliveries: 0,
    },
    charts: [],
    dashboards: [],
    dashboardFilterTargets: [],
    metricTreeDependents: [],
    scheduledDeliveries: [],
};

const breakingReport: FieldImpactReport = {
    projectUuid: 'project-1',
    fieldId: 'orders_total_revenue',
    fieldType: DBFieldTypes.METRIC,
    severity: FieldImpactSeverity.Breaking,
    summary: {
        charts: 2,
        dashboards: 1,
        dashboardFilterTargets: 1,
        metricTreeDependents: 1,
        scheduledDeliveries: 1,
    },
    charts: [
        {
            uuid: 'chart-1',
            name: 'Revenue by month',
            fieldType: DBFieldTypes.METRIC,
            viewsCount: 12,
            spaceUuid: 'space-1',
            spaceName: 'Finance',
            dashboardUuid: null,
            dashboardName: null,
        },
        {
            uuid: 'chart-2',
            name: 'Revenue tile',
            fieldType: DBFieldTypes.METRIC,
            viewsCount: 3,
            spaceUuid: 'space-1',
            spaceName: 'Finance',
            dashboardUuid: 'dashboard-1',
            dashboardName: 'Exec overview',
        },
    ],
    dashboards: [
        {
            uuid: 'dashboard-1',
            name: 'Exec overview',
            viaChartName: 'Revenue by month',
        },
    ],
    dashboardFilterTargets: [{ uuid: 'dashboard-2', name: 'Sales filters' }],
    metricTreeDependents: [
        {
            fieldId: 'orders_revenue_per_customer',
            tableName: 'orders',
            name: 'revenue_per_customer',
        },
    ],
    scheduledDeliveries: [
        {
            name: 'Weekly revenue',
            savedChartUuid: 'chart-1',
            dashboardUuid: null,
        },
    ],
};

describe('getAnalyzeFieldImpact', () => {
    it('renders the report and mirrors it as structured content', async () => {
        const analyzeFieldImpact = vi.fn().mockResolvedValue(breakingReport);
        const updateProgress = vi.fn().mockResolvedValue(undefined);
        const tool = getAnalyzeFieldImpact({
            analyzeFieldImpact,
            updateProgress,
        });

        const output = await execute(tool, 'orders_total_revenue');

        expect(updateProgress).toHaveBeenCalledWith(
            'Analyzing the impact of changing "orders_total_revenue"...',
        );
        expect(analyzeFieldImpact).toHaveBeenCalledWith({
            fieldId: 'orders_total_revenue',
        });
        expect(
            toolAnalyzeFieldImpactOutputSchema.safeParse(output).success,
        ).toBe(true);
        const parsed = toolAnalyzeFieldImpactOutputSchema.parse(output);

        expect(parsed.metadata).toEqual({ status: 'success' });
        expect(parsed.result).toContain(
            '<fieldImpact fieldId="orders_total_revenue" fieldType="metric" severity="breaking" chartCount="2" dashboardCount="1" dashboardFilterCount="1" dependentMetricCount="1" scheduledDeliveryCount="1">',
        );
        expect(parsed.result).toContain(
            '<chart uuid="chart-1" name="Revenue by month" space="Finance" views="12"/>',
        );
        expect(parsed.result).toContain(
            '<chart uuid="chart-2" name="Revenue tile" space="Finance" dashboard="Exec overview" views="3"/>',
        );
        expect(parsed.result).toContain(
            '<dashboard uuid="dashboard-1" name="Exec overview" viaChart="Revenue by month"/>',
        );
        expect(parsed.result).toContain(
            '<dashboard uuid="dashboard-2" name="Sales filters"/>',
        );
        expect(parsed.result).toContain(
            '<metric fieldId="orders_revenue_per_customer"/>',
        );
        expect(parsed.result).toContain(
            '<delivery name="Weekly revenue" savedChartUuid="chart-1"/>',
        );

        expect(parsed.structuredContent).toEqual({
            fieldId: 'orders_total_revenue',
            fieldType: 'metric',
            severity: 'breaking',
            summary: breakingReport.summary,
            charts: [
                {
                    uuid: 'chart-1',
                    name: 'Revenue by month',
                    spaceName: 'Finance',
                    dashboardName: null,
                    viewsCount: 12,
                },
                {
                    uuid: 'chart-2',
                    name: 'Revenue tile',
                    spaceName: 'Finance',
                    dashboardName: 'Exec overview',
                    viewsCount: 3,
                },
            ],
            dashboards: breakingReport.dashboards,
            dashboardFilterTargets: breakingReport.dashboardFilterTargets,
            metricTreeDependents: [{ fieldId: 'orders_revenue_per_customer' }],
            scheduledDeliveries: breakingReport.scheduledDeliveries,
        });
    });

    it('reports a safe field with no references and a null field type', async () => {
        const tool = getAnalyzeFieldImpact({
            analyzeFieldImpact: vi.fn().mockResolvedValue(emptyReport),
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await execute(tool, 'orders_total_revenue');

        expect(
            toolAnalyzeFieldImpactOutputSchema.safeParse(output).success,
        ).toBe(true);
        const parsed = toolAnalyzeFieldImpactOutputSchema.parse(output);

        expect(parsed.metadata).toEqual({ status: 'success' });
        expect(parsed.result).toContain(
            'fieldType="unknown" severity="safe" chartCount="0"',
        );
        expect(parsed.result).not.toContain('<charts>');
        expect(parsed.structuredContent).toEqual({
            fieldId: 'orders_total_revenue',
            fieldType: null,
            severity: 'safe',
            summary: emptyReport.summary,
            charts: [],
            dashboards: [],
            dashboardFilterTargets: [],
            metricTreeDependents: [],
            scheduledDeliveries: [],
        });
    });

    it('returns the error text as structured content when analysis throws', async () => {
        const tool = getAnalyzeFieldImpact({
            analyzeFieldImpact: vi
                .fn()
                .mockRejectedValue(new ForbiddenError('No access to project')),
            updateProgress: vi.fn().mockResolvedValue(undefined),
        });

        const output = await execute(tool, 'orders_total_revenue');

        expect(
            toolAnalyzeFieldImpactOutputSchema.safeParse(output).success,
        ).toBe(true);
        const parsed = toolAnalyzeFieldImpactOutputSchema.parse(output);

        expect(parsed.metadata).toEqual({ status: 'error' });
        expect(parsed.result).toContain(
            'Error analyzing the impact of "orders_total_revenue".',
        );
        expect(parsed.result).toContain('No access to project');
        expect(parsed.structuredContent).toEqual({ error: parsed.result });
    });
});
