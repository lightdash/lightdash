import { ParameterError } from '../types/errors';
import { FieldType, MetricType } from '../types/field';
import { QuerySourceType } from '../types/querySources';
import { ChartType } from '../types/savedCharts';
import {
    getComposerChartDisplayedQueryUuid,
    getComposerChartExportLabels,
    parseComposerChartInput,
    parseComposerChartRunRequest,
    parseComposerPipeline,
    parseComposerStoredChart,
    parseDashboardComposerChartRunRequest,
    parseExecuteComposerChartRequest,
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

    test.each([
        [
            'series that is not a list',
            { layout: {}, eChartsConfig: { series: {} } },
        ],
        ['an x field that is not a name', { layout: { xField: 1 } }],
    ])('refuses a cartesian config with %s', (_, config) => {
        refusal(() =>
            parseComposerStoredChart({
                ...chart,
                chartConfig: { type: ChartType.CARTESIAN, config },
            }),
        );
    });

    describe('custom chart type', () => {
        const customChart = {
            ...chart,
            columns: [
                ...chart.columns,
                { reference: 'region', fieldType: 'dimension' },
            ],
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz',
                    dataAppVizVersion: 2,
                    fieldMapping: {
                        category: 'month',
                        value: 'revenue',
                        series: ['region'],
                    },
                    optionValues: { showLegend: false },
                },
            },
            pivotConfig: { columns: ['region'] },
        };
        const unpinned = {
            ...customChart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz',
                    fieldMapping: { category: 'month' },
                },
            },
        };

        test('accepts a pinned type whose slots name columns', () => {
            expect(parseComposerStoredChart(customChart)).toEqual(customChart);
        });

        test('refuses a slot naming something that is not a column', () => {
            expect(
                refusal(() =>
                    parseComposerStoredChart({
                        ...customChart,
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                ...customChart.chartConfig.config,
                                fieldMapping: { series: ['profit'] },
                            },
                        },
                    }),
                ),
            ).toContain('"profit"');
        });

        test('refuses a stored chart without a pin; create input may omit it', () => {
            expect(refusal(() => parseComposerStoredChart(unpinned))).toContain(
                'dataAppVizVersion',
            );
            expect(parseComposerChartInput(unpinned)).toEqual(unpinned);
        });
    });

    test.each([
        [
            ChartType.TREEMAP,
            { groupFieldIds: ['month'], sizeMetricId: 'revenue' },
        ],
        [
            ChartType.GAUGE,
            {
                selectedField: 'revenue',
                sections: [
                    { min: 0, max: 1, color: '#000', maxFieldId: 'revenue' },
                ],
            },
        ],
        [ChartType.MAP, { locationFieldId: 'month', valueFieldId: 'revenue' }],
        [
            ChartType.SANKEY,
            {
                sourceFieldId: 'month',
                targetFieldId: 'month',
                metricFieldId: 'revenue',
            },
        ],
        [ChartType.CUSTOM, { spec: { mark: 'bar' } }],
    ])('accepts a %s chart naming its columns', (type, config) => {
        const document = { ...chart, chartConfig: { type, config } };
        expect(parseComposerStoredChart(document)).toEqual(document);
    });

    test.each([
        [ChartType.TREEMAP, { colorMetricId: 'profit' }],
        [
            ChartType.GAUGE,
            {
                sections: [
                    { min: 0, max: 1, color: '#000', minFieldId: 'profit' },
                ],
            },
        ],
        [ChartType.MAP, { latitudeFieldId: 'profit' }],
        [ChartType.SANKEY, { metricFieldId: 'profit' }],
    ])('refuses a %s chart naming a missing column', (type, config) => {
        expect(
            refusal(() =>
                parseComposerStoredChart({
                    ...chart,
                    chartConfig: { type, config },
                }),
            ),
        ).toContain('"profit"');
    });
});

describe('parseComposerChartRunRequest', () => {
    const request = {
        dashboardUuid: 'dashboard-uuid',
        tileUuid: 'tile-uuid',
        dashboardFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        parameters: { region: 'east' },
        excludedParameterKeys: [],
        invalidateCache: false,
    };

    it('accepts the tile-shaped request', () => {
        expect(parseComposerChartRunRequest(request)).toEqual(request);
    });

    it.each([
        ['nodes', { nodes: [{ sourceType: 'sql', sql: 'select 1' }] }],
        ['pipeline', { pipeline: {} }],
    ])('refuses a request carrying %s', (key, extra) => {
        expect(() =>
            parseComposerChartRunRequest({ ...request, ...extra }),
        ).toThrow(key);
    });
});

describe('parseDashboardComposerChartRunRequest', () => {
    const request = {
        composerChartUuid: 'chart-uuid',
        dashboardUuid: 'dashboard-uuid',
        tileUuid: 'tile-uuid',
        dashboardFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        parameters: {},
        excludedParameterKeys: [],
        invalidateCache: false,
        dateZoom: null,
    };

    it('accepts the tile request naming its chart', () => {
        expect(parseDashboardComposerChartRunRequest(request)).toEqual(request);
    });

    it('refuses a request naming no chart', () => {
        const { composerChartUuid, ...withoutChart } = request;
        expect(() =>
            parseDashboardComposerChartRunRequest(withoutChart),
        ).toThrow('composerChartUuid');
    });

    it('refuses a request carrying nodes', () => {
        expect(() =>
            parseDashboardComposerChartRunRequest({
                ...request,
                nodes: [{ sourceType: 'sql', sql: 'select 1' }],
            }),
        ).toThrow('nodes');
    });
});

describe('parseExecuteComposerChartRequest', () => {
    const request = { composerChartUuid: 'chart-uuid', invalidateCache: false };

    it('accepts a chart run with or without caller parameters', () => {
        expect(parseExecuteComposerChartRequest(request)).toEqual(request);
        expect(
            parseExecuteComposerChartRequest({
                ...request,
                parameters: { region: 'EU' },
            }),
        ).toEqual({ ...request, parameters: { region: 'EU' } });
    });

    it.each(['dashboardUuid', 'tileUuid', 'dashboardFilters', 'dateZoom'])(
        'refuses a request carrying %s',
        (key) => {
            expect(() =>
                parseExecuteComposerChartRequest({ ...request, [key]: null }),
            ).toThrow(key);
        },
    );
});

describe('getComposerChartDisplayedQueryUuid', () => {
    const queries = [
        {
            nodeId: 'orders',
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            queryUuid: 'q-orders',
        },
        {
            nodeId: 'monthly',
            sourceType: QuerySourceType.DUCKDB,
            queryUuid: 'q-monthly',
        },
    ];

    it('is the chart stage when the run has one', () => {
        expect(
            getComposerChartDisplayedQueryUuid(
                { queries, chartStageQueryUuid: 'q-stage' },
                'monthly',
            ),
        ).toBe('q-stage');
    });

    it('is the terminal node without a chart stage', () => {
        expect(
            getComposerChartDisplayedQueryUuid(
                { queries, chartStageQueryUuid: null },
                'monthly',
            ),
        ).toBe('q-monthly');
    });

    it('is null when the terminal node did not run', () => {
        expect(
            getComposerChartDisplayedQueryUuid(
                { queries: [], chartStageQueryUuid: null },
                'monthly',
            ),
        ).toBeNull();
    });
});

describe('getComposerChartExportLabels', () => {
    it('labels each column with its governed label, without the table', () => {
        expect(
            getComposerChartExportLabels({
                orders_total_order_amount: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'total_order_amount',
                    label: 'Total order amount',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '',
                    hidden: false,
                },
            }),
        ).toEqual({ orders_total_order_amount: 'Total order amount' });
    });
});
