import {
    ChartType,
    NotFoundError,
    toolCreateContentOutputSchema,
    type ChartAsCode,
    type DashboardAsCode,
    type ToolCreateContentArgs,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';

const options: ToolExecutionOptions = { toolCallId: 'call', messages: [] };

const chart: ChartAsCode = {
    name: 'Orders by status',
    description: 'Orders per status',
    slug: 'orders-by-status',
    spaceSlug: 'sales',
    tableName: 'orders',
    dashboardSlug: undefined,
    version: 1,
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status', 'orders_region'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_status', yField: ['orders_count'] },
            eChartsConfig: {},
        },
    },
};

const dashboard: DashboardAsCode = {
    name: 'Sales overview',
    description: 'Sales KPIs',
    slug: 'sales-overview',
    spaceSlug: 'sales',
    version: 1,
    tiles: [],
    tabs: [],
};

const chartArgs: ToolCreateContentArgs = {
    type: 'chart',
    content: {
        ...chart,
        description: chart.description ?? null,
        contentType: 'chart',
        verified: false,
        dashboardSlug: '',
    },
};

const dashboardArgs: ToolCreateContentArgs = {
    type: 'dashboard',
    content: {
        ...dashboard,
        description: dashboard.description ?? null,
        contentType: 'dashboard',
        verified: false,
    },
};

const createdChart: Awaited<ReturnType<CreateContentFn>> = {
    type: 'chart',
    content: { ...chart, slug: 'orders-by-status-1' },
    uuid: '0f1a7a9e-4d2b-4c1e-9a52-2a4c8e2c6d11',
    href: '/projects/project/saved/0f1a7a9e-4d2b-4c1e-9a52-2a4c8e2c6d11',
};

const createdDashboard: Awaited<ReturnType<CreateContentFn>> = {
    type: 'dashboard',
    content: dashboard,
    uuid: '6c0e3b2f-8a5d-4f7e-b1c9-3d2e1f0a9b8c',
    href: '/projects/project/dashboards/6c0e3b2f-8a5d-4f7e-b1c9-3d2e1f0a9b8c',
};

const executeCreateContent = async (
    createContent: CreateContentFn,
    args: ToolCreateContentArgs,
) => {
    const createContentTool = getCreateContent({ createContent });
    if (!createContentTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await createContentTool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Unexpected streamed output');
    }
    return output;
};

describe('createContent tool', () => {
    test('returns the created chart as text, metadata and structured content from the same facts', async () => {
        const output = await executeCreateContent(
            vi.fn().mockResolvedValue(createdChart),
            chartArgs,
        );

        expect(output.result).toBe(
            `<chart href="${createdChart.href}" />\n---\n${JSON.stringify(
                createdChart.content,
                null,
                2,
            )}\n---\nWarning: metricQuery.dimensions includes fields not used by the chart configuration: orders_region. Use each dimension in layout.xField, layout.yField, or pivotConfig.columns, otherwise remove it.`,
        );
        expect(output.metadata).toEqual({
            status: 'success',
            slug: 'orders-by-status-1',
            name: chart.name,
            uuid: createdChart.uuid,
            href: createdChart.href,
            warnings: [expect.stringContaining('orders_region')],
        });
        expect(output.structuredContent).toEqual({
            type: 'chart',
            href: createdChart.href,
            uuid: createdChart.uuid,
            slug: 'orders-by-status-1',
            name: chart.name,
            content: createdChart.content,
            warnings: [expect.stringContaining('orders_region')],
        });
        expect(toolCreateContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    test('returns the created dashboard without warnings', async () => {
        const output = await executeCreateContent(
            vi.fn().mockResolvedValue(createdDashboard),
            dashboardArgs,
        );

        expect(output.result).toBe(
            `<dashboard href="${createdDashboard.href}" />\n---\n${JSON.stringify(
                dashboard,
                null,
                2,
            )}`,
        );
        expect(output.structuredContent).toEqual({
            type: 'dashboard',
            href: createdDashboard.href,
            uuid: createdDashboard.uuid,
            slug: dashboard.slug,
            name: dashboard.name,
            content: dashboard,
            warnings: [],
        });
        expect(output.result).toContain(createdDashboard.href);
        expect(output.result).toContain(`"slug": "${dashboard.slug}"`);
        expect(toolCreateContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    test('mirrors a creation failure as structured error content', async () => {
        const output = await executeCreateContent(
            vi.fn().mockRejectedValue(new NotFoundError('Space not found')),
            dashboardArgs,
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Error creating dashboard "sales-overview". Content was not created.',
        );
        expect(output.result).toContain('Space not found');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolCreateContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
