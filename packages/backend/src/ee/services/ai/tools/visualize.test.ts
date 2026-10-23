import {
    DimensionType,
    QuerySourceType,
    type AiArtifact,
    type AiWebAppPrompt,
    type ComposerNodeColumn,
    type ThreadComposerQueryNode,
    type ToolVisualizeArgs,
    type ToolVisualizeOutput,
} from '@lightdash/common';
import type {
    CreateOrUpdateArtifactFn,
    DeferSlackVisualizationFn,
    GetThreadComposerNodeColumnsFn,
    ResolveCustomChartTypeFn,
    RunComposerQueriesFn,
} from '../types/aiAgentDependencies';
import { getVisualize } from './visualize';

const prompt = {
    promptUuid: 'prompt-uuid',
    threadUuid: 'thread-uuid',
} as AiWebAppPrompt;

const slackPrompt = {
    ...prompt,
    slackUserId: 'U1',
} as unknown as AiWebAppPrompt;

const tableConfig: ToolVisualizeArgs['vizConfig'] = {
    type: 'table',
    x: null,
    y: null,
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

const ordersNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by month and status',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_total_order_amount'],
    limit: 500,
};

const shareNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'share',
    title: 'Share by status',
    sql: 'SELECT orders_status, sum(orders_total_order_amount) AS amount FROM orders GROUP BY 1',
    references: ['orders'],
    limit: 500,
};

const unrelatedNode: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'signups',
    title: 'Signups',
    sql: 'SELECT 1',
    limit: 500,
};

const barConfig: ToolVisualizeArgs['vizConfig'] = {
    type: 'bar',
    x: 'orders_order_date_month',
    y: ['orders_total_order_amount'],
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

const customConfig: ToolVisualizeArgs['vizConfig'] = {
    type: 'custom',
    customChartTypeSlug: 'status-ribbon',
    fieldMapping: {
        month: 'orders_order_date_month',
        status: 'orders_status',
        amount: 'orders_total_order_amount',
    },
    options: null,
};

const resolveStatusRibbon: ResolveCustomChartTypeFn = async (slug) =>
    slug === 'status-ribbon'
        ? {
              dataAppVizUuid: 'viz-uuid',
              name: 'Status ribbon',
              dataAppVizVersion: 3,
              schema: { fields: [], configOptions: [], colorPalette: null },
          }
        : null;

const ordersColumns: ComposerNodeColumn[] = [
    { reference: 'orders_order_date_month', type: DimensionType.DATE },
    { reference: 'orders_status', type: DimensionType.STRING },
    { reference: 'orders_total_order_amount', type: DimensionType.NUMBER },
];

const shareColumns: ComposerNodeColumn[] = [
    { reference: 'orders_status', type: DimensionType.STRING },
    { reference: 'amount', type: DimensionType.NUMBER },
];

const makeRun = (
    rows: Record<string, unknown>[],
    terminalNodeId: string,
): Awaited<ReturnType<RunComposerQueriesFn>> => ({
    submissions: [],
    terminal: {
        queryUuid: 'query-uuid',
        columns: Object.fromEntries(
            (terminalNodeId === 'share' ? shareColumns : ordersColumns).map(
                (column) => [column.reference, column],
            ),
        ),
        rows,
        rowCount: rows.length,
    },
});

const makeTool = ({
    threadNodes = [ordersNode, shareNode, unrelatedNode],
    nodeColumns = {},
    rows = [],
    currentPrompt = prompt,
    resolveCustomChartType = resolveStatusRibbon,
    deferSlackVisualization,
    slackLinksOnly = false,
}: {
    threadNodes?: ThreadComposerQueryNode[];
    nodeColumns?: Record<string, ComposerNodeColumn[]>;
    rows?: Record<string, unknown>[];
    currentPrompt?: AiWebAppPrompt;
    resolveCustomChartType?: ResolveCustomChartTypeFn;
    deferSlackVisualization?: DeferSlackVisualizationFn;
    slackLinksOnly?: boolean;
} = {}) => {
    const versions: Parameters<CreateOrUpdateArtifactFn>[0][] = [];
    const runComposerQueries = vi.fn(
        async ({ terminalNodeId }: Parameters<RunComposerQueriesFn>[0]) =>
            makeRun(rows, terminalNodeId),
    );
    const tool = getVisualize({
        getPrompt: async () => currentPrompt,
        listThreadComposerQueryNodes: async () => threadNodes,
        getThreadComposerNodeColumns: (async ({ nodeId }) =>
            nodeColumns[nodeId] ??
            null) satisfies GetThreadComposerNodeColumnsFn,
        runComposerQueries,
        resolveCustomChartType,
        maxQueryLimit: 1000,
        createOrUpdateArtifact: async (data) => {
            versions.push(data);
            return {
                artifactUuid: 'artifact-uuid',
                versionUuid: `version-${versions.length}`,
            } as AiArtifact;
        },
        updateProgress: async () => {},
        deferSlackVisualization,
        slackLinksOnly,
    });
    const visualize = (args: Partial<ToolVisualizeArgs> = {}) =>
        tool.execute!(
            {
                nodeId: 'orders',
                title: 'Order amount by month',
                description: null,
                vizConfig: barConfig,
                ...args,
            },
            { messages: [], toolCallId: 'call', context: {} },
        ) as Promise<ToolVisualizeOutput>;
    return { visualize, versions, runComposerQueries };
};

describe('visualize', () => {
    it('writes a composer v2 version of the node and what it reads, without running it', async () => {
        const { visualize, versions, runComposerQueries } = makeTool();

        const output = await visualize({
            nodeId: 'share',
            title: 'Amount by status',
            description: 'Order amount per status.',
            vizConfig: { ...barConfig, x: 'orders_status', y: ['amount'] },
        });

        expect(output.metadata).toEqual({
            status: 'success',
            nodeId: 'share',
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-1',
            queryUuid: null,
        });
        expect(versions).toEqual([
            {
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                artifactType: 'chart',
                title: 'Amount by status',
                description: 'Order amount per status.',
                vizConfig: {
                    source: 'composer',
                    schemaVersion: 2,
                    queries: [ordersNode, shareNode],
                    terminalNodeId: 'share',
                    vizConfig: {
                        ...barConfig,
                        x: 'orders_status',
                        y: ['amount'],
                    },
                },
            },
        ]);
        expect(runComposerQueries).not.toHaveBeenCalled();
    });

    it('writes a classic semantic version for a lone semantic node', async () => {
        const { visualize, versions, runComposerQueries } = makeTool({
            rows: [
                { orders_status: 'completed' },
                { orders_status: 'returned' },
            ],
        });

        const output = await visualize({
            vizConfig: {
                ...barConfig,
                groupBy: ['orders_status'],
                stack: true,
                labels: { x: 'Month', y: 'Amount', y2: null },
            },
        });

        expect(output.metadata).toMatchObject({
            status: 'success',
            versionUuid: 'version-1',
        });
        expect(versions).toEqual([
            {
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                artifactType: 'chart',
                title: 'Order amount by month',
                vizConfig: {
                    source: 'semantic',
                    config: {
                        title: 'Order amount by month',
                        description: '',
                        queryConfig: {
                            exploreName: 'orders',
                            dimensions: [
                                'orders_order_date_month',
                                'orders_status',
                            ],
                            metrics: ['orders_total_order_amount'],
                            filters: null,
                            sorts: [],
                            limit: 500,
                            parameters: null,
                            customMetrics: null,
                            tableCalculations: null,
                        },
                        chartConfig: {
                            defaultVizType: 'bar',
                            xAxisDimension: 'orders_order_date_month',
                            yAxisMetrics: ['orders_total_order_amount'],
                            groupBy: ['orders_status'],
                            xAxisType: null,
                            stackBars: true,
                            lineType: null,
                            xAxisLabel: 'Month',
                            yAxisLabel: 'Amount',
                            secondaryYAxisMetric: null,
                            secondaryYAxisLabel: null,
                        },
                        mergeConfig: null,
                    },
                },
            },
        ]);
        expect(runComposerQueries).toHaveBeenCalledWith({
            queries: [ordersNode],
            terminalNodeId: 'orders',
        });
    });

    it('writes a composer version for a lone semantic node classic charts cannot draw', async () => {
        const { visualize, versions } = makeTool();
        const bigNumber = {
            ...barConfig,
            type: 'big_number' as const,
            x: null,
        };

        await visualize({ vizConfig: bigNumber });

        expect(versions[0].vizConfig).toEqual({
            source: 'composer',
            schemaVersion: 2,
            queries: [ordersNode],
            terminalNodeId: 'orders',
            vizConfig: bigNumber,
        });
    });

    it('writes the card without hints when the hint run fails', async () => {
        const { visualize, versions, runComposerQueries } = makeTool();
        runComposerQueries.mockRejectedValueOnce(new Error('warehouse down'));

        const output = await visualize({
            vizConfig: { ...barConfig, type: 'pie', x: 'orders_status' },
        });

        expect(output.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [],
        });
        expect(versions).toHaveLength(1);
    });

    it('writes one version per call, so two calls show two cards', async () => {
        const { visualize, versions } = makeTool();

        await visualize({ nodeId: 'share' });
        await visualize({
            nodeId: 'share',
            vizConfig: { ...barConfig, type: 'line' },
        });

        expect(versions).toHaveLength(2);
        expect(versions.map((v) => v.vizConfig.vizConfig)).toEqual([
            barConfig,
            { ...barConfig, type: 'line' },
        ]);
    });

    it("rejects a node id outside the thread's nodes, naming them", async () => {
        const { visualize, versions } = makeTool({
            threadNodes: [ordersNode],
        });

        const output = await visualize({ nodeId: 'revenue' });

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain('"revenue"');
        expect(output.result).toContain(
            'orders ("Orders by month and status")',
        );
        expect(versions).toEqual([]);
    });

    it('notes a pie with many slices and a split with many series', async () => {
        const rows = Array.from({ length: 13 }, (_, i) => ({
            orders_order_date_month: `2026-${i}`,
            orders_status: `status-${i}`,
        }));
        const { visualize, versions } = makeTool({ rows });

        const pie = await visualize({
            vizConfig: { ...barConfig, type: 'pie', x: 'orders_status' },
        });
        const split = await visualize({
            vizConfig: { ...barConfig, groupBy: ['orders_status'] },
        });

        expect(pie.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [
                'This pie has 13 categories; a bar chart or table will make comparisons easier.',
            ],
        });
        expect(pie.result).toContain('a bar chart or table');
        expect(split.structuredContent).toEqual({
            nodeId: 'orders',
            hints: [
                'This chart has 13 series; consider a table or an explicitly requested narrower grouping.',
            ],
        });
        expect(versions).toHaveLength(2);
    });

    it('runs a Slack table so its rows can post as a Slack table', async () => {
        const { visualize, runComposerQueries } = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_status: 'completed' }],
        });

        const output = await visualize({ vizConfig: tableConfig });

        expect(runComposerQueries).toHaveBeenCalledOnce();
        expect(output.metadata).toMatchObject({
            status: 'success',
            queryUuid: 'query-uuid',
        });
    });

    it('runs a Slack big number so its value can post, unless links-only; a lone semantic node stays a composer version', async () => {
        const slack = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_total_order_amount: 42 }],
        });
        const linksOnly = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_total_order_amount: 42 }],
            slackLinksOnly: true,
        });
        const bigNumber = { ...tableConfig, type: 'big_number' as const };

        const output = await slack.visualize({ vizConfig: bigNumber });
        await linksOnly.visualize({ vizConfig: bigNumber });

        expect(output.metadata).toMatchObject({ queryUuid: 'query-uuid' });
        expect(slack.versions[0].vizConfig).toMatchObject({
            source: 'composer',
        });
        expect(linksOnly.runComposerQueries).not.toHaveBeenCalled();
    });

    it('does not run a web table or a Slack chart without hints', async () => {
        const web = makeTool();
        const slack = makeTool({ currentPrompt: slackPrompt });

        const webTable = await web.visualize({ vizConfig: tableConfig });
        const slackChart = await slack.visualize();

        expect(web.runComposerQueries).not.toHaveBeenCalled();
        expect(slack.runComposerQueries).not.toHaveBeenCalled();
        expect(webTable.metadata).toMatchObject({ queryUuid: null });
        expect(slackChart.metadata).toMatchObject({ queryUuid: null });
    });

    it('registers a classic Slack chart image for a lone semantic node', async () => {
        const deferSlackVisualization = vi.fn(async () => true);
        const { visualize, runComposerQueries } = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_status: 'completed' }, { orders_status: 'placed' }],
            deferSlackVisualization,
        });

        const output = await visualize();

        expect(runComposerQueries).toHaveBeenCalledOnce();
        expect(deferSlackVisualization).toHaveBeenCalledExactlyOnceWith({
            source: 'runQuery',
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-1',
            queryUuid: 'query-uuid',
            rowLimit: 2,
            queryTool: expect.objectContaining({
                queryConfig: expect.objectContaining({
                    exploreName: 'orders',
                    metrics: ['orders_total_order_amount'],
                }),
                chartConfig: expect.objectContaining({
                    defaultVizType: 'bar',
                    xAxisDimension: 'orders_order_date_month',
                }),
            }),
        });
        expect(output.metadata).toMatchObject({ queryUuid: 'query-uuid' });
    });

    it('registers a composer Slack chart image for a pipeline node', async () => {
        const deferSlackVisualization = vi.fn(async () => true);
        const { visualize } = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_status: 'completed' }, { orders_status: 'placed' }],
            deferSlackVisualization,
        });

        await visualize({
            nodeId: 'share',
            vizConfig: { ...barConfig, x: 'orders_status', y: ['amount'] },
        });

        expect(deferSlackVisualization).toHaveBeenCalledExactlyOnceWith({
            source: 'composer',
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-1',
            queryUuid: 'query-uuid',
            rowLimit: 2,
        });
    });

    it('registers no Slack image for tables, big numbers, custom types, empty results or links-only orgs', async () => {
        const deferSlackVisualization = vi.fn(async () => true);
        const withRows = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_status: 'completed' }],
            deferSlackVisualization,
        });
        const empty = makeTool({
            currentPrompt: slackPrompt,
            deferSlackVisualization,
        });
        const linksOnly = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_status: 'completed' }],
            deferSlackVisualization,
            slackLinksOnly: true,
        });

        await withRows.visualize({ vizConfig: tableConfig });
        await withRows.visualize({
            vizConfig: { ...tableConfig, type: 'big_number' },
        });
        await withRows.visualize({ vizConfig: customConfig });
        await empty.visualize();
        await linksOnly.visualize();

        expect(deferSlackVisualization).not.toHaveBeenCalled();
        expect(linksOnly.runComposerQueries).not.toHaveBeenCalled();
    });

    it('keeps the Slack chart card when image registration fails', async () => {
        const { visualize, versions } = makeTool({
            currentPrompt: slackPrompt,
            rows: [{ orders_status: 'completed' }],
            deferSlackVisualization: async () => {
                throw new Error('outbox unavailable');
            },
        });

        const output = await visualize();

        expect(output.metadata).toMatchObject({ status: 'success' });
        expect(versions).toHaveLength(1);
    });

    it('pins the custom chart type version it resolved from the slug', async () => {
        const { visualize, versions, runComposerQueries } = makeTool();

        const output = await visualize({
            nodeId: 'share',
            vizConfig: customConfig,
        });

        expect(output.metadata.status).toBe('success');
        expect(versions[0].vizConfig).toMatchObject({
            schemaVersion: 2,
            terminalNodeId: 'share',
            vizConfig: {
                ...customConfig,
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 3,
            },
        });
        expect(runComposerQueries).not.toHaveBeenCalled();
    });

    it('writes a classic custom chart type version for a lone semantic node', async () => {
        const { visualize, versions } = makeTool();

        await visualize({ vizConfig: customConfig });

        expect(versions[0].vizConfig).toEqual({
            source: 'customChartType',
            schemaVersion: 1,
            dataAppVizUuid: 'viz-uuid',
            dataAppVizVersion: 3,
            config: expect.objectContaining({
                chartConfig: {
                    customChartTypeSlug: 'status-ribbon',
                    fieldMapping: customConfig.fieldMapping,
                    options: null,
                },
                mergeConfig: null,
            }),
        });
    });

    it('rejects an unknown custom chart type slug without writing a card', async () => {
        const { visualize, versions } = makeTool();

        const output = await visualize({
            vizConfig: { ...customConfig, customChartTypeSlug: 'sankey' },
        });

        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain(
            'Custom chart type "sankey" was not found in this project',
        );
        expect(versions).toEqual([]);
    });
    describe('validates column references against the node columns', () => {
        const visualizeOrders = (vizConfig: ToolVisualizeArgs['vizConfig']) => {
            const tool = makeTool({ nodeColumns: { orders: ordersColumns } });
            return { ...tool, output: tool.visualize({ vizConfig }) };
        };

        it('rejects an unknown column, naming the columns with their types, without writing a card', async () => {
            const { output, versions, runComposerQueries } = visualizeOrders({
                ...barConfig,
                x: 'order_month',
            });

            const result = await output;

            expect(result.metadata.status).toBe('error');
            expect(result.result).toContain(
                'x: column "order_month" is not in the result',
            );
            expect(result.result).toContain(
                'orders_order_date_month (date), orders_status (string), orders_total_order_amount (number)',
            );
            expect(versions).toEqual([]);
            expect(runComposerQueries).not.toHaveBeenCalled();
        });

        it.each([
            [
                'a non-numeric y',
                { ...barConfig, y: ['orders_status'] },
                'y: column "orders_status" is string, not numeric',
            ],
            [
                'a non-numeric big number value',
                {
                    ...barConfig,
                    type: 'big_number' as const,
                    x: null,
                    y: ['orders_status'],
                },
                'y: column "orders_status" is string, not numeric',
            ],
            [
                'y2 also in y',
                { ...barConfig, y2: 'orders_total_order_amount' },
                'y2: column "orders_total_order_amount" must not also be in y',
            ],
            [
                'groupBy on x',
                { ...barConfig, groupBy: ['orders_order_date_month'] },
                'groupBy: column "orders_order_date_month" must not also be on x or y',
            ],
            [
                'a split without explicit y',
                { ...barConfig, y: null, groupBy: ['orders_status'] },
                'groupBy: a series split needs explicit x and y columns',
            ],
        ])('rejects %s', async (_, vizConfig, message) => {
            const { output, versions } = visualizeOrders(vizConfig);

            const result = await output;

            expect(result.metadata.status).toBe('error');
            expect(result.result).toContain(message);
            expect(versions).toEqual([]);
        });

        it('rejects a default y when no numeric column is left to draw', async () => {
            const { visualize, versions } = makeTool({
                nodeColumns: { orders: ordersColumns.slice(0, 2) },
            });

            const output = await visualize({
                vizConfig: { ...tableConfig, type: 'big_number' },
            });

            expect(output.result).toContain(
                'y: no numeric column to draw; set y to a numeric column',
            );
            expect(versions).toEqual([]);
        });

        it('checks only y[0] where a chart draws one value', async () => {
            const { output, versions } = visualizeOrders({
                ...barConfig,
                type: 'funnel',
                x: 'orders_status',
                y: ['orders_total_order_amount', 'orders_order_date_month'],
            });

            expect((await output).metadata.status).toBe('success');
            expect(versions).toHaveLength(1);
        });

        it('writes a config whose references match the node columns', async () => {
            const { output, versions } = visualizeOrders({
                ...barConfig,
                groupBy: ['orders_status'],
            });

            expect((await output).metadata.status).toBe('success');
            expect(versions).toHaveLength(1);
        });

        it("validates against the run's columns when hints run the node", async () => {
            const { visualize, versions } = makeTool();

            const output = await visualize({
                nodeId: 'share',
                vizConfig: {
                    ...barConfig,
                    type: 'pie',
                    x: 'status',
                    y: ['amount'],
                },
            });

            expect(output.result).toContain(
                'x: column "status" is not in the result',
            );
            expect(output.result).toContain(
                'orders_status (string), amount (number)',
            );
            expect(versions).toEqual([]);
        });

        describe('custom chart types', () => {
            const resolveRibbonWithSlots: ResolveCustomChartTypeFn =
                async () => ({
                    dataAppVizUuid: 'viz-uuid',
                    name: 'Status ribbon',
                    dataAppVizVersion: 3,
                    schema: {
                        fields: [
                            {
                                name: 'month',
                                label: 'Month',
                                type: 'dimension',
                                required: true,
                            },
                            {
                                name: 'status',
                                label: 'Status',
                                type: 'series',
                                required: false,
                            },
                            {
                                name: 'amount',
                                label: 'Amount',
                                type: 'metric',
                                required: false,
                            },
                        ],
                        configOptions: [],
                        colorPalette: null,
                    },
                });
            const visualizeCustom = (
                fieldMapping: Record<string, string | string[]>,
            ) => {
                const tool = makeTool({
                    nodeColumns: { orders: ordersColumns },
                    resolveCustomChartType: resolveRibbonWithSlots,
                });
                return {
                    ...tool,
                    output: tool.visualize({
                        vizConfig: { ...customConfig, fieldMapping },
                    }),
                };
            };

            it.each([
                [
                    'an unbound required slot',
                    { amount: 'orders_total_order_amount' },
                    'fieldMapping: required slot "month" is not bound',
                ],
                [
                    'several columns on a single slot',
                    { month: ['orders_order_date_month', 'orders_status'] },
                    'fieldMapping.month: slot takes one column',
                ],
                [
                    'an unknown slot',
                    { month: 'orders_order_date_month', size: 'orders_status' },
                    'fieldMapping: "size" is not a slot of this chart type (slots: month, status, amount)',
                ],
                [
                    'an unknown column',
                    { month: 'order_month' },
                    'fieldMapping.month: column "order_month" is not in the result',
                ],
                [
                    'a non-numeric metric slot',
                    {
                        month: 'orders_order_date_month',
                        amount: 'orders_status',
                    },
                    'metric slot: column "orders_status" is string, not numeric',
                ],
                [
                    'a series slot without a metric slot',
                    {
                        month: 'orders_order_date_month',
                        status: 'orders_status',
                    },
                    'fieldMapping: a series slot needs a column on a metric slot',
                ],
            ])('rejects %s', async (_, fieldMapping, message) => {
                const { output, versions } = visualizeCustom(fieldMapping);

                const result = await output;

                expect(result.metadata.status).toBe('error');
                expect(result.result).toContain(message);
                expect(versions).toEqual([]);
            });

            it('accepts any column on dimension and series slots', async () => {
                const { output, versions } = visualizeCustom({
                    month: 'orders_total_order_amount',
                    status: 'orders_status',
                    amount: 'orders_total_order_amount',
                });

                expect((await output).metadata.status).toBe('success');
                expect(versions).toHaveLength(1);
            });
        });
    });
});
