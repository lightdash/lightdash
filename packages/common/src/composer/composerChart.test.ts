import { ParameterError } from '../types/errors';
import { ChartType } from '../types/savedCharts';
import {
    parseComposerPipeline,
    parseComposerStoredChart,
} from './composerChart';

const orders = {
    sourceType: 'semanticLayer',
    nodeId: 'orders',
    title: 'Orders by month',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
};
const monthly = {
    sourceType: 'duckdb',
    nodeId: 'monthly',
    title: 'Monthly revenue',
    sql: 'SELECT orders_order_date_month AS month, orders_total_order_amount AS revenue FROM orders',
    references: ['orders'],
};
const pipeline = {
    schemaVersion: 1,
    terminalNodeId: 'monthly',
    nodes: [orders, monthly],
};

const chart = {
    schemaVersion: 1,
    columns: [
        { reference: 'month', fieldType: 'dimension' },
        { reference: 'revenue', fieldType: 'metric' },
    ],
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'month', yField: ['revenue'] },
            eChartsConfig: {
                series: [
                    {
                        type: 'bar',
                        encode: {
                            xRef: { field: 'month' },
                            yRef: { field: 'revenue' },
                        },
                    },
                ],
            },
        },
    },
    pivotConfig: null,
    tableConfig: { columnOrder: ['month', 'revenue'] },
};

const refusal = (parse: () => unknown): string => {
    try {
        parse();
    } catch (e) {
        expect(e).toBeInstanceOf(ParameterError);
        return (e as Error).message;
    }
    throw new Error('Expected the document to be refused');
};

describe('parseComposerPipeline', () => {
    test('accepts a pipeline whose nodes the terminal node reads', () => {
        expect(parseComposerPipeline(pipeline)).toEqual(pipeline);
    });

    test.each([
        ['an unknown envelope key', { ...pipeline, extra: true }],
        [
            'an unknown node key',
            { ...pipeline, nodes: [{ ...orders, extra: 1 }, monthly] },
        ],
        [
            'an external node',
            {
                ...pipeline,
                terminalNodeId: 'ext',
                nodes: [
                    {
                        sourceType: 'external',
                        nodeId: 'ext',
                        title: 'External',
                        sql: 'SELECT 1',
                        tables: ['t'],
                    },
                ],
            },
        ],
        [
            'an api node',
            {
                ...pipeline,
                terminalNodeId: 'api',
                nodes: [
                    {
                        sourceType: 'api',
                        nodeId: 'api',
                        title: 'Api',
                        connectionUuid: 'c',
                        payload: { kind: 'query', query: 'select 1' },
                    },
                ],
            },
        ],
        [
            'a node without a title',
            { ...pipeline, nodes: [{ ...orders, title: undefined }, monthly] },
        ],
        ['an unknown schema version', { ...pipeline, schemaVersion: 2 }],
    ])('refuses %s', (_, document) => {
        refusal(() => parseComposerPipeline(document));
    });

    test('refuses a reference to a query uuid', () => {
        expect(
            refusal(() =>
                parseComposerPipeline({
                    ...pipeline,
                    nodes: [
                        orders,
                        {
                            ...monthly,
                            references: {
                                orders: 'orders',
                                prev: '8b3c3d9e-0f4c-4c1e-9b8a-3c2d1e0f4a5b',
                            },
                        },
                    ],
                }),
            ),
        ).toContain('8b3c3d9e-0f4c-4c1e-9b8a-3c2d1e0f4a5b');
    });

    test('refuses duplicate node ids', () => {
        expect(
            refusal(() =>
                parseComposerPipeline({
                    ...pipeline,
                    nodes: [orders, orders, monthly],
                }),
            ),
        ).toContain('"orders"');
    });

    test('refuses a cycle', () => {
        expect(
            refusal(() =>
                parseComposerPipeline({
                    schemaVersion: 1,
                    terminalNodeId: 'a',
                    nodes: [
                        { ...monthly, nodeId: 'a', references: ['b'] },
                        { ...monthly, nodeId: 'b', references: ['a'] },
                    ],
                }),
            ),
        ).toContain('cycle');
    });

    test('refuses a node the terminal node does not read', () => {
        expect(
            refusal(() =>
                parseComposerPipeline({
                    ...pipeline,
                    nodes: [
                        orders,
                        monthly,
                        { ...orders, nodeId: 'unused', title: 'Unused' },
                    ],
                }),
            ),
        ).toContain('"unused"');
    });

    test('refuses a missing terminal node', () => {
        expect(
            refusal(() =>
                parseComposerPipeline({ ...pipeline, terminalNodeId: 'nope' }),
            ),
        ).toContain('"nope"');
    });

    test('refuses a merge source that is not a semanticLayer node', () => {
        refusal(() =>
            parseComposerPipeline({
                schemaVersion: 1,
                terminalNodeId: 'merged',
                nodes: [
                    orders,
                    monthly,
                    {
                        sourceType: 'merge',
                        nodeId: 'merged',
                        title: 'Merged',
                        sources: [{ nodeId: 'orders' }, { nodeId: 'monthly' }],
                        joinKey: [],
                        joinType: 'full',
                    },
                ],
            }),
        );
    });
});

describe('parseComposerStoredChart', () => {
    test('accepts a chart whose configs name its columns', () => {
        expect(parseComposerStoredChart(chart)).toEqual(chart);
    });

    test('refuses an unknown envelope key', () => {
        refusal(() => parseComposerStoredChart({ ...chart, vizConfig: {} }));
    });

    test('refuses duplicate column names', () => {
        expect(
            refusal(() =>
                parseComposerStoredChart({
                    ...chart,
                    columns: [
                        ...chart.columns,
                        { reference: 'month', fieldType: 'dimension' },
                    ],
                }),
            ),
        ).toContain('"month"');
    });

    test('refuses a column name with a dot, naming it', () => {
        expect(
            refusal(() =>
                parseComposerStoredChart({
                    ...chart,
                    columns: [
                        ...chart.columns,
                        { reference: 'orders.status', fieldType: 'dimension' },
                    ],
                }),
            ),
        ).toContain('"orders.status"');
    });

    test.each([
        [
            'chartConfig',
            {
                ...chart,
                chartConfig: {
                    type: ChartType.BIG_NUMBER,
                    config: { selectedField: 'profit' },
                },
            },
        ],
        ['pivotConfig', { ...chart, pivotConfig: { columns: ['profit'] } }],
        [
            'tableConfig',
            { ...chart, tableConfig: { columnOrder: ['month', 'profit'] } },
        ],
    ])('refuses a %s name that is not a column', (_, document) => {
        expect(refusal(() => parseComposerStoredChart(document))).toContain(
            '"profit"',
        );
    });

    test('refuses a custom chart type, naming it', () => {
        expect(
            refusal(() =>
                parseComposerStoredChart({
                    ...chart,
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: { dataAppVizUuid: 'viz', fieldMapping: {} },
                    },
                }),
            ),
        ).toContain('custom chart types');
    });

    test('refuses a chart type it cannot check', () => {
        refusal(() =>
            parseComposerStoredChart({
                ...chart,
                chartConfig: { type: ChartType.SANKEY, config: {} },
            }),
        );
    });
});
