import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type ItemsMap,
} from '../types/field';
import { MergeJoinType } from '../types/mergeQuery';
import { QuerySourceType } from '../types/querySources';
import { type ResultColumn } from '../types/results';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import {
    type ComposerChartPipeline,
    type ComposerStoredChart,
} from './composerChart';
import {
    getComposerChartDraw,
    getComposerChartPivotStage,
    pickComposerChartRows,
} from './composerChartDraw';

const sqlPipeline: ComposerChartPipeline = {
    schemaVersion: 1,
    terminalNodeId: 'orders',
    nodes: [
        {
            nodeId: 'orders',
            title: 'Orders',
            sourceType: QuerySourceType.SQL,
            sql: 'select 1',
        },
    ],
};

const semanticPipeline: ComposerChartPipeline = {
    schemaVersion: 1,
    terminalNodeId: 'orders',
    nodes: [
        {
            nodeId: 'orders',
            title: 'Orders',
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total'],
        },
    ],
};

const barChart = (x: string, y: string): ChartConfig => ({
    type: ChartType.CARTESIAN,
    config: {
        layout: { xField: x, yField: [y] },
        eChartsConfig: { series: [] },
    },
});

const storedChart = (
    overrides: Partial<ComposerStoredChart> = {},
): ComposerStoredChart => ({
    schemaVersion: 1,
    columns: [
        { reference: 'status', fieldType: FieldType.DIMENSION },
        { reference: 'revenue', fieldType: FieldType.METRIC },
    ],
    chartConfig: barChart('status', 'revenue'),
    pivotConfig: null,
    tableConfig: { columnOrder: ['status', 'revenue'] },
    ...overrides,
});

const sqlColumns: ResultColumn[] = [
    { reference: 'status', type: DimensionType.STRING },
    { reference: 'revenue', type: DimensionType.NUMBER, label: 'Revenue' },
    { reference: 'ignored', type: DimensionType.STRING },
];

const statusDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    table: 'orders',
    label: 'Order status',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
    compiledSql: '"orders".status',
    tablesReferences: ['orders'],
} as CompiledDimension;

const totalMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'total',
    table: 'orders',
    label: 'Total',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
    format: '"$"#,##0',
    compiledSql: 'SUM("orders".amount)',
    tablesReferences: ['orders'],
} as CompiledMetric;

const semanticFields: ItemsMap = {
    orders_status: statusDimension,
    orders_total: totalMetric,
};

const semanticChart = storedChart({
    columns: [
        { reference: 'orders_status', fieldType: FieldType.DIMENSION },
        { reference: 'orders_total', fieldType: FieldType.METRIC },
    ],
    chartConfig: barChart('orders_status', 'orders_total'),
    tableConfig: { columnOrder: ['orders_status', 'orders_total'] },
});

const semanticColumns: ResultColumn[] = [
    { reference: 'orders_status', type: DimensionType.STRING },
    { reference: 'orders_total', type: DimensionType.NUMBER },
];

describe('getComposerChartDraw', () => {
    test('a sql result draws fields built per column under <composer>, ids as column names', () => {
        const draw = getComposerChartDraw({
            pipeline: sqlPipeline,
            chart: storedChart(),
            columns: sqlColumns,
            fields: {},
        });

        expect(draw.metricQuery.dimensions).toEqual(['status']);
        expect(draw.metricQuery.metrics).toEqual(['revenue']);
        expect(Object.keys(draw.fields)).toEqual(['status', 'revenue']);
        expect(draw.fields.revenue).toMatchObject({
            table: '<composer>',
            name: 'revenue',
            label: 'Revenue',
            fieldType: FieldType.METRIC,
        });
        expect(draw.chartConfig).toEqual(barChart('status', 'revenue'));
        expect(draw.columnOrder).toEqual(['status', 'revenue']);
        expect(draw.pivotColumns).toEqual([]);
    });

    test('a semantic-layer result draws the run’s own fields, so labels and formats are current', () => {
        const draw = getComposerChartDraw({
            pipeline: semanticPipeline,
            chart: semanticChart,
            columns: semanticColumns,
            fields: semanticFields,
        });

        expect(draw.fields).toEqual(semanticFields);
        expect(draw.metricQuery).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total'],
        });
    });

    test('a merge result draws the merge’s own items', () => {
        const mergePipeline: ComposerChartPipeline = {
            schemaVersion: 1,
            terminalNodeId: 'joined',
            nodes: [
                ...semanticPipeline.nodes,
                {
                    ...semanticPipeline.nodes[0],
                    nodeId: 'other',
                } as ComposerChartPipeline['nodes'][number],
                {
                    nodeId: 'joined',
                    title: 'Joined',
                    sourceType: QuerySourceType.MERGE,
                    sources: [{ nodeId: 'orders' }, { nodeId: 'other' }],
                    joinKey: [],
                    joinType: MergeJoinType.INNER,
                },
            ],
        };
        const draw = getComposerChartDraw({
            pipeline: mergePipeline,
            chart: semanticChart,
            columns: semanticColumns,
            fields: semanticFields,
        });

        expect(draw.fields).toEqual(semanticFields);
        expect(draw.metricQuery.metrics).toEqual(['orders_total']);
    });

    test.each([
        ['sql', sqlPipeline, storedChart(), [sqlColumns[1]], {}, 'status'],
        [
            'semantic-layer',
            semanticPipeline,
            semanticChart,
            [semanticColumns[1]],
            semanticFields,
            'orders_status',
        ],
    ])(
        'a %s result missing a mapped column errors naming it',
        (_, pipeline, chart, columns, fields, missing) => {
            expect(() =>
                getComposerChartDraw({ pipeline, chart, columns, fields }),
            ).toThrow(`Column "${missing}" is missing from the result`);
        },
    );

    test('a metric column that is no longer numeric errors naming it', () => {
        expect(() =>
            getComposerChartDraw({
                pipeline: sqlPipeline,
                chart: storedChart(),
                columns: [
                    sqlColumns[0],
                    { reference: 'revenue', type: DimensionType.STRING },
                ],
                fields: {},
            }),
        ).toThrow('Column "revenue" is no longer numeric');
    });

    test('a semantic-layer metric column that is now a non-numeric dimension errors naming it', () => {
        expect(() =>
            getComposerChartDraw({
                pipeline: semanticPipeline,
                chart: semanticChart,
                columns: [
                    semanticColumns[0],
                    { reference: 'orders_total', type: DimensionType.STRING },
                ],
                fields: {
                    ...semanticFields,
                    orders_total: { ...statusDimension, name: 'total' },
                },
            }),
        ).toThrow('Column "orders_total" is no longer numeric');
    });

    test('a group-by on a cartesian chart draws its split columns as pivot dimensions', () => {
        const draw = getComposerChartDraw({
            pipeline: sqlPipeline,
            chart: storedChart({
                columns: [
                    ...storedChart().columns,
                    { reference: 'method', fieldType: FieldType.DIMENSION },
                ],
                pivotConfig: { columns: ['method'] },
            }),
            columns: [
                ...sqlColumns,
                { reference: 'method', type: DimensionType.STRING },
            ],
            fields: {},
        });

        expect(draw.pivotColumns).toEqual(['method']);
    });

    test('a group-by on a chart that is not cartesian is not drawn', () => {
        expect(() =>
            getComposerChartDraw({
                pipeline: sqlPipeline,
                chart: storedChart({
                    chartConfig: { type: ChartType.TABLE, config: {} },
                    pivotConfig: { columns: ['status'] },
                }),
                columns: sqlColumns,
                fields: {},
            }),
        ).toThrow('Group-by is only drawn on bar, line, area and scatter');
    });
});

describe('pickComposerChartRows', () => {
    test('keeps only the chart’s columns, since builders read any extra key as data', () => {
        const value = (raw: unknown) => ({
            value: { raw, formatted: String(raw) },
        });
        const draw = getComposerChartDraw({
            pipeline: sqlPipeline,
            chart: storedChart(),
            columns: sqlColumns,
            fields: {},
        });

        expect(
            pickComposerChartRows(draw, [
                {
                    status: value('done'),
                    revenue: value(3),
                    ignored: value('x'),
                },
            ]),
        ).toEqual([{ status: value('done'), revenue: value(3) }]);
    });
});

describe('getComposerChartPivotStage', () => {
    const splitChart = storedChart({
        columns: [
            { reference: 'month', fieldType: FieldType.DIMENSION },
            { reference: 'method', fieldType: FieldType.DIMENSION },
            { reference: 'revenue', fieldType: FieldType.METRIC },
        ],
        chartConfig: barChart('month', 'revenue'),
        pivotConfig: { columns: ['method'] },
        tableConfig: { columnOrder: [] },
    });

    test('is null without a group-by', () => {
        expect(
            getComposerChartPivotStage(sqlPipeline, storedChart()),
        ).toBeNull();
    });

    test('pivots the terminal node’s rows from the stored columns and pivotConfig alone', () => {
        expect(
            getComposerChartPivotStage(sqlPipeline, splitChart),
        ).toMatchObject({
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'chart_stage',
            references: { node_result: 'orders' },
            pivotConfiguration: {
                indexColumn: [{ reference: 'month' }],
                groupByColumns: [{ reference: 'method' }],
                valuesColumns: [{ reference: 'revenue' }],
            },
        });
    });

    test('derives the pivot like a classic chart: node sorts, y values, stacked groups past the limit folded', () => {
        const pipeline: ComposerChartPipeline = {
            ...semanticPipeline,
            nodes: [
                {
                    nodeId: 'orders',
                    title: 'Orders',
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    exploreName: 'orders',
                    dimensions: ['month', 'method'],
                    metrics: ['revenue', 'orders'],
                    sorts: [{ fieldId: 'revenue', descending: true }],
                },
            ],
        };
        const stacked = barChart('month', 'revenue');
        if (stacked.type !== ChartType.CARTESIAN || !stacked.config) {
            throw new Error('bar chart is cartesian');
        }
        const stage = getComposerChartPivotStage(pipeline, {
            ...splitChart,
            columns: [
                ...splitChart.columns,
                { reference: 'orders', fieldType: FieldType.METRIC },
            ],
            chartConfig: {
                ...stacked,
                config: {
                    ...stacked.config,
                    layout: { ...stacked.config.layout, stack: true },
                },
            },
        });
        expect(stage).toMatchObject({ sourceType: QuerySourceType.DUCKDB });
        if (stage?.sourceType !== QuerySourceType.DUCKDB) return;
        expect(stage.pivotConfiguration).toMatchObject({
            valuesColumns: [{ reference: 'revenue' }],
            sortBy: [{ reference: 'revenue', direction: 'DESC' }],
            foldOverflowGroups: true,
        });
    });

    test('takes a node id no stored node uses', () => {
        const pipeline: ComposerChartPipeline = {
            ...sqlPipeline,
            terminalNodeId: 'chart_stage',
            nodes: [{ ...sqlPipeline.nodes[0], nodeId: 'chart_stage' }],
        };
        expect(getComposerChartPivotStage(pipeline, splitChart)?.nodeId).toBe(
            '_chart_stage',
        );
    });

    test('is null for a chart that is not cartesian, which the tile refuses to draw', () => {
        expect(
            getComposerChartPivotStage(sqlPipeline, {
                ...splitChart,
                chartConfig: { type: ChartType.TABLE, config: {} },
            }),
        ).toBeNull();
    });
});
