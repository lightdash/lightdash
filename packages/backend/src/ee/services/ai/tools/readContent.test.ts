import {
    ForbiddenError,
    NotFoundError,
    toolReadContentOutputSchema,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { getReadContent } from './readContent';

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

type Read = Awaited<ReturnType<ReadContentFn>>;

const dashboardTile = {
    type: 'saved_chart',
    tileSlug: 'orders-per-month',
    properties: { chartSlug: 'orders-per-month' },
};

const dashboardRead = {
    type: 'dashboard',
    href: '/projects/project/dashboards/dashboard-uuid/view',
    content: {
        name: 'Overview',
        slug: 'overview',
        tiles: [
            {
                ...dashboardTile,
                properties: {
                    ...dashboardTile.properties,
                    chartQuery: {
                        exploreName: 'orders',
                        fieldIds: ['orders_order_date_month'],
                    },
                },
            },
        ],
    },
} as unknown as Read;

const dashboardReadWithoutChartQuery = {
    ...dashboardRead,
    content: {
        ...dashboardRead.content,
        tiles: [dashboardTile],
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
        siteUrl: 'https://app.lightdash.cloud',
        readContent: vi.fn().mockResolvedValue(read),
    });
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    return tool.execute(args, options);
};

describe('readContent tool', () => {
    it('tells the agent how to target dashboard filters per tile when it reads a dashboard', async () => {
        const output = await execute(dashboardReadWithoutChartQuery, {
            slug: 'overview',
            type: 'dashboard',
        });

        expect(output).toHaveProperty(
            'result',
            expect.stringContaining('chartQuery'),
        );
        expect(output).toHaveProperty(
            'result',
            expect.stringContaining('tileTargets'),
        );
    });

    it('passes each tile explore through to the agent when it reads a dashboard', async () => {
        const output = await execute(dashboardRead, {
            slug: 'overview',
            type: 'dashboard',
        });

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
        expect(output).toHaveProperty(
            'result',
            expect.not.stringContaining('chartQuery'),
        );
    });

    it.each([null, 'c1'])(
        'reads a chart and ignores the Document-only chartId %j',
        async (chartId) => {
            const readContent = vi.fn().mockResolvedValue(chartRead);
            const tool = getReadContent({
                siteUrl: 'https://app.lightdash.cloud',
                readContent,
                documentsEnabled: true,
            });

            const output = await tool.execute!(
                { slug: 'orders-per-month', type: 'chart', chartId },
                options,
            );

            expect(readContent).toHaveBeenCalledWith({
                slug: 'orders-per-month',
                type: 'chart',
            });
            expect(output).toHaveProperty('metadata.status', 'success');
        },
    );

    describe('when the slug is another content type', () => {
        const sqlChartRead = {
            type: 'sql_chart',
            href: '/projects/project/sql-runner/orders-per-month#chart-link',
            content: { name: 'Orders per month', slug: 'orders-per-month' },
        } as unknown as Read;

        const executeWith = (
            readsByType: Partial<Record<Read['type'], Read | Error>>,
            documentsEnabled = false,
        ) => {
            const readContent = vi.fn(
                async ({ type }: Parameters<ReadContentFn>[0]) => {
                    const read = readsByType[type];
                    if (read === undefined) {
                        throw new NotFoundError(`${type} was not found`);
                    }
                    if (read instanceof Error) throw read;
                    return read;
                },
            );
            const tool = getReadContent({
                siteUrl: 'https://app.lightdash.cloud',
                readContent,
                documentsEnabled,
            });
            return {
                readContent,
                output: tool.execute!(
                    { slug: 'orders-per-month', type: 'chart', chartId: null },
                    options,
                ),
            };
        };

        it('returns the one match and names its type', async () => {
            const { output } = executeWith({ sql_chart: sqlChartRead });
            const result = await output;

            expect(toolReadContentOutputSchema.safeParse(result).success).toBe(
                true,
            );
            expect(result).toHaveProperty(
                'structuredContent.type',
                'sql_chart',
            );
            expect(result).toHaveProperty(
                'result',
                expect.stringContaining(
                    'No chart "orders-per-month" could be read; returned the sql_chart "orders-per-month" instead. Use type sql_chart for further calls to it.',
                ),
            );
        });

        it('does not guess when several types match', async () => {
            const { output } = executeWith({
                sql_chart: sqlChartRead,
                dashboard: dashboardRead,
            });
            const result = await output;

            expect(toolReadContentOutputSchema.safeParse(result).success).toBe(
                true,
            );
            expect(result).toHaveProperty('metadata.status', 'error');
            expect(result).toHaveProperty(
                'result',
                expect.stringContaining(
                    'matches more than one type: dashboard, sql_chart. Retry with one of those types.',
                ),
            );
        });

        it('keeps the not-found error when no type matches', async () => {
            const { output } = executeWith({});

            expect(await output).toHaveProperty(
                'result',
                expect.stringContaining('chart was not found'),
            );
        });

        it.each([
            { documentsEnabled: true, status: 'success' },
            { documentsEnabled: false, status: 'error' },
        ])(
            'finds a Document only when the tool offers Documents ($documentsEnabled)',
            async ({ documentsEnabled, status }) => {
                const documentRead = {
                    type: 'document',
                    href: '/projects/project/documents/orders-per-month',
                    uuid: 'document-uuid',
                    versionUuid: 'version-uuid',
                    content: { name: 'Orders', slug: 'orders-per-month' },
                } as unknown as Read;
                const { output } = executeWith(
                    { document: documentRead },
                    documentsEnabled,
                );

                expect(await output).toHaveProperty('metadata.status', status);
            },
        );

        it('does not pick a match while another type failed to answer', async () => {
            const { output } = executeWith({
                sql_chart: sqlChartRead,
                dashboard: new Error('Connection timed out'),
            });

            expect(await output).toHaveProperty(
                'result',
                expect.stringContaining('chart was not found'),
            );
        });

        it('does not reveal a match the user may not read', async () => {
            const { output } = executeWith({
                sql_chart: new ForbiddenError('Cannot view SQL chart'),
            });

            expect(await output).toHaveProperty(
                'result',
                expect.stringContaining('chart was not found'),
            );
        });

        it('does not fall back when the requested type is forbidden', async () => {
            const { output } = executeWith({
                chart: new ForbiddenError('Cannot view chart'),
                sql_chart: sqlChartRead,
            });

            expect(await output).toHaveProperty(
                'result',
                expect.stringContaining('Cannot view chart'),
            );
        });
    });
});
