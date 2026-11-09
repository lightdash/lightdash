import { NotSupportedError, ParameterError } from '../types/errors';
import { DimensionType } from '../types/field';
import { QuerySourceType, type SourceQuery } from '../types/querySources';
import { type ResultColumn } from '../types/results';
import { ChartType } from '../types/savedCharts';
import { TimeFrames } from '../types/timeFrames';
import {
    convertComposerVizConfigToChart,
    toSavedComposerPipeline,
} from './composerChartSave';
import {
    composerChartVizConfigSchemaPersisted,
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
} from './composerChartVizConfigSchema';

const columns: ResultColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    { reference: 'status', type: DimensionType.STRING },
    { reference: 'revenue', type: DimensionType.NUMBER },
];

const viz = (
    config: Partial<ComposerBuiltinChartVizConfig> &
        Pick<ComposerBuiltinChartVizConfig, 'type'>,
): ComposerStoredChartVizConfig =>
    composerChartVizConfigSchemaPersisted.parse({
        x: null,
        y: null,
        groupBy: null,
        stack: null,
        horizontal: null,
        y2: null,
        labels: null,
        ...config,
    });

const convert = (
    vizConfig: ComposerStoredChartVizConfig | null,
    resultColumns: ResultColumn[] = columns,
) =>
    convertComposerVizConfigToChart({
        vizConfig,
        columns: resultColumns,
        terminalNodeId: 'by_status',
        metadata: { title: 'Revenue by status', description: '' },
    });

describe('convertComposerVizConfigToChart', () => {
    test('no viz config draws a table', () => {
        expect(convert(null)).toEqual({
            chartConfig: { type: ChartType.TABLE },
            pivotConfig: undefined,
        });
    });

    test('bar draws a cartesian chart over composer result field ids', () => {
        const { chartConfig, pivotConfig } = convert(
            viz({ type: 'bar', x: 'status', y: ['revenue'] }),
        );
        expect(chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'composer_result_status',
                    yField: ['composer_result_revenue'],
                },
                eChartsConfig: { series: [{ type: 'bar' }] },
            },
        });
        expect(pivotConfig).toBeUndefined();
    });

    test('a series split becomes the pivot columns', () => {
        const { chartConfig, pivotConfig } = convert(
            viz({
                type: 'line',
                x: 'orders_month',
                y: ['revenue'],
                groupBy: ['status'],
            }),
        );
        expect(chartConfig.type).toBe(ChartType.CARTESIAN);
        expect(pivotConfig).toEqual({ columns: ['composer_result_status'] });
    });

    test('each builtin type keeps its chart type', () => {
        expect(convert(viz({ type: 'table' })).chartConfig.type).toBe(
            ChartType.TABLE,
        );
        expect(
            convert(viz({ type: 'big_number', y: ['revenue'] })).chartConfig
                .type,
        ).toBe(ChartType.BIG_NUMBER);
        expect(
            convert(viz({ type: 'pie', x: 'status', y: ['revenue'] }))
                .chartConfig.type,
        ).toBe(ChartType.PIE);
        expect(
            convert(viz({ type: 'funnel', x: 'status', y: ['revenue'] }), [
                { reference: 'status', type: DimensionType.STRING },
                { reference: 'revenue', type: DimensionType.NUMBER },
            ]).chartConfig.type,
        ).toBe(ChartType.FUNNEL);
        expect(
            convert(viz({ type: 'scatter', x: 'orders_month', y: ['revenue'] }))
                .chartConfig.type,
        ).toBe(ChartType.CARTESIAN);
        expect(
            convert(viz({ type: 'area', x: 'orders_month', y: ['revenue'] }))
                .chartConfig.type,
        ).toBe(ChartType.CARTESIAN);
    });

    test('refuses a custom chart type by name', () => {
        const custom: ComposerStoredChartVizConfig = {
            type: 'custom',
            customChartTypeSlug: 'ribbon',
            fieldMapping: { x: 'status', values: ['revenue'] },
            options: null,
            dataAppVizUuid: 'viz-uuid',
            dataAppVizVersion: 1,
        };
        expect(() => convert(custom)).toThrow(NotSupportedError);
        expect(() => convert(custom)).toThrow(/custom chart type/);
    });

    test('a pie over more metrics than it draws is saved', () => {
        const { chartConfig } = convert(viz({ type: 'pie', x: 'status' }), [
            { reference: 'status', type: DimensionType.STRING },
            { reference: 'revenue', type: DimensionType.NUMBER },
            { reference: 'orders', type: DimensionType.NUMBER },
        ]);
        expect(chartConfig.type).toBe(ChartType.PIE);
    });

    test('a pie without a category column falls back to a table of every metric', () => {
        const { chartConfig } = convert(viz({ type: 'pie' }), [
            { reference: 'revenue', type: DimensionType.NUMBER },
            { reference: 'orders', type: DimensionType.NUMBER },
        ]);
        expect(chartConfig.type).toBe(ChartType.TABLE);
    });

    test('refuses a funnel a saved chart would draw over other columns', () => {
        // The stored funnel config has no stage slot; viewers read the first non-numeric column.
        expect(() =>
            convert(viz({ type: 'funnel', x: 'status', y: ['revenue'] })),
        ).toThrow(/"by_status" charts status, revenue but .* orders_month/);
        expect(() =>
            convert(viz({ type: 'funnel', x: null, y: null }), [
                { reference: 'visits', type: DimensionType.NUMBER },
                { reference: 'purchases', type: DimensionType.NUMBER },
            ]),
        ).toThrow(/visits, purchases but .* visits;/);
    });

    test('a table drawn from a column named with "__" is refused too', () => {
        expect(() =>
            convert(null, [
                { reference: 'status__name', type: DimensionType.STRING },
            ]),
        ).toThrow(/"by_status".*"status__name"/);
    });

    test('refuses a charted column whose name contains "__", naming it and the node', () => {
        const aliased: ResultColumn[] = [
            { reference: 'status__name', type: DimensionType.STRING },
            { reference: 'revenue', type: DimensionType.NUMBER },
        ];
        const attempt = () =>
            convert(
                viz({ type: 'bar', x: 'status__name', y: ['revenue'] }),
                aliased,
            );
        expect(attempt).toThrow(ParameterError);
        expect(attempt).toThrow(/"by_status".*"status__name"/);
    });
});

describe('toSavedComposerPipeline', () => {
    const orders: SourceQuery = {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'orders',
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total_order_amount'],
    };
    const byStatus: SourceQuery = {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'by_status',
        sql: 'SELECT * FROM orders',
        references: ['orders'],
    };

    test('stores the artifact nodes as a schema 1 pipeline', () => {
        expect(
            toSavedComposerPipeline({
                queries: [orders, byStatus],
                terminalNodeId: 'by_status',
            }),
        ).toEqual({
            schemaVersion: 1,
            nodes: [orders, byStatus],
            terminalNodeId: 'by_status',
        });
    });

    test('stores only the presented node and what it reads', () => {
        const sibling: SourceQuery = {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'scratch',
            code: 'result = inputs["orders"]',
            references: ['orders'],
        };
        expect(
            toSavedComposerPipeline({
                queries: [orders, sibling, byStatus],
                terminalNodeId: 'by_status',
            }).nodes,
        ).toEqual([orders, byStatus]);
    });

    test('refuses a node reading a result by query uuid, naming the node', () => {
        const attempt = () =>
            toSavedComposerPipeline({
                queries: [
                    {
                        ...byStatus,
                        references: {
                            orders: '4d97672e-63f5-4f4b-a1bf-e817c5e830b5',
                        },
                    },
                ],
                terminalNodeId: 'by_status',
            });
        expect(attempt).toThrow(ParameterError);
        expect(attempt).toThrow(/"by_status".*uuid/);
    });

    test('refuses a python node by name', () => {
        expect(() =>
            toSavedComposerPipeline({
                queries: [
                    orders,
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'by_status',
                        code: 'result = inputs["orders"]',
                        references: ['orders'],
                    },
                ],
                terminalNodeId: 'by_status',
            }),
        ).toThrow(/by_status/);
    });
});
