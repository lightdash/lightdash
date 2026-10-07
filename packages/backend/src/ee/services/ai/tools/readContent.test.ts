import type { ToolExecutionOptions } from 'ai';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { getReadContent } from './readContent';

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

type Read = Awaited<ReturnType<ReadContentFn>>;

const dashboardRead = {
    type: 'dashboard',
    href: '/projects/project/dashboards/dashboard-uuid/view',
    content: {
        name: 'Overview',
        slug: 'overview',
        tiles: [
            {
                type: 'saved_chart',
                tileSlug: 'orders-per-month',
                properties: {
                    chartSlug: 'orders-per-month',
                    chartQuery: {
                        exploreName: 'orders',
                        fieldIds: ['orders_order_date_month'],
                    },
                },
            },
        ],
    },
} as unknown as Read;

const chartRead = {
    type: 'chart',
    href: '/projects/project/saved/chart-uuid',
    content: { name: 'Orders per month', slug: 'orders-per-month' },
} as unknown as Read;

const execute = async (
    read: Read,
    args: { slug: string; type: 'dashboard' | 'chart' },
) => {
    const tool = getReadContent({
        readContent: vi.fn().mockResolvedValue(read),
    });
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    return tool.execute(args, options);
};

describe('readContent tool', () => {
    it('tells the agent how to target dashboard filters per tile when it reads a dashboard', async () => {
        const output = await execute(dashboardRead, {
            slug: 'overview',
            type: 'dashboard',
        });

        expect(output).toHaveProperty(
            'result',
            expect.stringContaining('"target": { "fieldId", "tableName" }'),
        );
        expect(output).toHaveProperty(
            'result',
            expect.stringContaining('"chartQuery"'),
        );
        expect(output).toHaveProperty(
            'result',
            expect.stringContaining('"exploreName": "orders"'),
        );
    });

    it('does not add dashboard filter guidance to chart reads', async () => {
        const output = await execute(chartRead, {
            slug: 'orders-per-month',
            type: 'chart',
        });

        expect(output).toHaveProperty(
            'result',
            expect.not.stringContaining('tileTargets'),
        );
    });
});
