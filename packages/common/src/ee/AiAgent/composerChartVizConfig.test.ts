import { DimensionType } from '../../types/field';
import { QuerySourceType } from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import { ChartType } from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import {
    VizAggregationOptions,
    VizIndexType,
} from '../../visualizations/types';
import { type DataAppVizFieldType } from '../apps/types';
import {
    composerChartVizConfigSchema,
    composerChartVizConfigSchemaPersisted,
    getComposerChartStage,
    getComposerRunQueryChart,
    parseComposerStoredChartVizConfig,
    toComposerResultRows,
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
} from './composerChartVizConfig';

const columns: ResultColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    { reference: 'status', type: DimensionType.STRING },
    { reference: 'revenue', type: DimensionType.NUMBER },
    { reference: 'order_count', type: DimensionType.NUMBER },
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

const ribbon: ComposerStoredChartVizConfig = {
    type: 'custom',
    customChartTypeSlug: 'ribbon',
    fieldMapping: {
        x: 'orders_month',
        series: 'status',
        values: ['revenue'],
    },
    options: null,
    dataAppVizUuid: 'viz-uuid',
    dataAppVizVersion: 3,
};

describe('composer viz config schemas', () => {
    test('builtin types take axes and drop custom fields', () => {
        expect(
            composerChartVizConfigSchema.parse({
                type: 'bar',
                x: 'status',
                y: ['revenue'],
                groupBy: null,
                stack: null,
                horizontal: null,
                y2: null,
                labels: null,
                customChartTypeSlug: 'ribbon',
            }),
        ).not.toHaveProperty('customChartTypeSlug');
    });

    test('builtin types require their axes', () => {
        expect(
            composerChartVizConfigSchema.safeParse({
                type: 'bar',
                customChartTypeSlug: 'ribbon',
                fieldMapping: { x: 'status' },
                options: null,
            }).success,
        ).toBe(false);
    });

    test('custom requires a slug and a field mapping', () => {
        const custom = {
            type: 'custom',
            customChartTypeSlug: 'ribbon',
            fieldMapping: { x: 'status' },
            options: null,
        };
        expect(composerChartVizConfigSchema.parse(custom)).toEqual(custom);
        expect(
            composerChartVizConfigSchema.safeParse({
                ...custom,
                customChartTypeSlug: null,
            }).success,
        ).toBe(false);
        expect(
            composerChartVizConfigSchema.safeParse({
                ...custom,
                fieldMapping: null,
            }).success,
        ).toBe(false);
    });

    test('stored custom carries the pinned chart type, stored builtin none', () => {
        expect(parseComposerStoredChartVizConfig(ribbon)).toEqual(ribbon);
        expect(
            parseComposerStoredChartVizConfig({
                ...ribbon,
                dataAppVizUuid: null,
            }),
        ).toBeNull();
        expect(
            parseComposerStoredChartVizConfig({
                type: 'line',
                x: null,
                y: null,
                groupBy: null,
                stack: null,
                horizontal: null,
                y2: null,
                labels: null,
                dataAppVizUuid: null,
                dataAppVizVersion: null,
            }),
        ).not.toHaveProperty('dataAppVizUuid');
    });
});

const chart = (
    config: ComposerStoredChartVizConfig,
    customChartTypeSlots: { name: string; type: DataAppVizFieldType }[] = [],
) =>
    getComposerRunQueryChart({
        columns,
        vizConfig: config,
        metadata: { title: '', description: '' },
        customChartTypeSlots,
    });

describe('getComposerRunQueryChart', () => {
    test('bar with groupBy pivots the split column under synthetic field ids', () => {
        const result = chart(
            viz({
                type: 'bar',
                x: 'orders_month',
                y: ['revenue'],
                groupBy: ['status'],
            }),
        );
        expect(result.metricQuery.dimensions).toEqual([
            'composer_result_orders_month',
            'composer_result_status',
        ]);
        expect(result.metricQuery.metrics).toEqual(['composer_result_revenue']);
        expect(result.fields.composer_result_orders_month).toMatchObject({
            type: DimensionType.DATE,
            table: 'composer_result',
            name: 'orders_month',
        });
        expect(result.fields.composer_result_revenue).toMatchObject({
            table: 'composer_result',
            name: 'revenue',
        });
        expect(result.chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'composer_result_orders_month',
                    yField: ['composer_result_revenue'],
                },
                eChartsConfig: { series: [{ type: 'bar' }] },
            },
        });
        expect(result.pivotColumns).toEqual(['composer_result_status']);
    });

    test('stacked bar sets stack on the series', () => {
        const { chartConfig } = chart(
            viz({
                type: 'bar',
                x: 'orders_month',
                y: ['revenue'],
                groupBy: ['status'],
                stack: true,
            }),
        );
        expect(chartConfig).toMatchObject({
            config: {
                layout: { stack: true },
                eChartsConfig: {
                    series: [{ stack: 'composer_result_revenue' }],
                },
            },
        });
    });

    test('horizontal bar flips axes', () => {
        const { chartConfig } = chart(
            viz({
                type: 'bar',
                horizontal: true,
                x: 'status',
                y: ['revenue'],
            }),
        );
        expect(chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: { layout: { flipAxes: true } },
        });
    });

    test('line infers x and y from column types', () => {
        const { metricQuery, chartConfig, pivotColumns } = chart(
            viz({ type: 'line' }),
        );
        expect(metricQuery.dimensions).toEqual([
            'composer_result_orders_month',
        ]);
        expect(metricQuery.metrics).toEqual([
            'composer_result_revenue',
            'composer_result_order_count',
        ]);
        expect(chartConfig).toMatchObject({
            config: {
                eChartsConfig: {
                    series: [
                        {
                            type: 'line',
                            encode: {
                                yRef: { field: 'composer_result_revenue' },
                            },
                        },
                        {
                            type: 'line',
                            encode: {
                                yRef: { field: 'composer_result_order_count' },
                            },
                        },
                    ],
                },
            },
        });
        expect(pivotColumns).toEqual([]);
    });

    test('area with groupBy is a stacked line with area style', () => {
        const { chartConfig, pivotColumns } = chart(
            viz({
                type: 'area',
                x: 'orders_month',
                y: ['revenue'],
                groupBy: ['status'],
                stack: true,
            }),
        );
        expect(chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: {
                eChartsConfig: {
                    series: [{ type: 'line', areaStyle: {}, stack: 'total' }],
                },
            },
        });
        expect(pivotColumns).toEqual(['composer_result_status']);
    });

    test('y2 goes on the secondary axis', () => {
        const { chartConfig, metricQuery } = chart(
            viz({
                type: 'line',
                x: 'orders_month',
                y: ['revenue'],
                y2: 'order_count',
                labels: { x: null, y: 'Revenue', y2: 'Orders' },
            }),
        );
        expect(metricQuery.metrics).toEqual([
            'composer_result_revenue',
            'composer_result_order_count',
        ]);
        expect(chartConfig).toMatchObject({
            config: {
                eChartsConfig: {
                    yAxis: [{ name: 'Revenue' }, { name: 'Orders' }],
                    series: [{ yAxisIndex: 0 }, { yAxisIndex: 1 }],
                },
            },
        });
    });

    test('area y2 is drawn as an unstacked line', () => {
        const { chartConfig } = chart(
            viz({
                type: 'area',
                x: 'orders_month',
                y: ['revenue'],
                y2: 'order_count',
            }),
        );
        expect(chartConfig).toMatchObject({
            config: {
                layout: { stack: false },
                eChartsConfig: {
                    series: [
                        { yAxisIndex: 0, areaStyle: {}, stack: 'total' },
                        {
                            yAxisIndex: 1,
                            areaStyle: undefined,
                            stack: undefined,
                        },
                    ],
                },
            },
        });
    });

    test('y2 in y is rejected', () => {
        expect(() =>
            chart(
                viz({
                    type: 'bar',
                    x: 'status',
                    y: ['revenue'],
                    y2: 'revenue',
                }),
            ),
        ).toThrow('y2 must not be in y: revenue');
    });

    test('scatter plots y against x', () => {
        const { chartConfig } = chart(
            viz({ type: 'scatter', x: 'order_count', y: ['revenue'] }),
        );
        expect(chartConfig).toMatchObject({
            config: {
                layout: { xField: 'composer_result_order_count' },
                eChartsConfig: { series: [{ type: 'scatter' }] },
            },
        });
    });

    test('pie slices y[0] by x and ignores groupBy', () => {
        const { chartConfig, metricQuery, pivotColumns } = chart(
            viz({
                type: 'pie',
                x: 'status',
                y: ['revenue'],
                groupBy: ['orders_month'],
            }),
        );
        expect(metricQuery.dimensions).toEqual(['composer_result_status']);
        expect(chartConfig).toMatchObject({
            type: ChartType.PIE,
            config: {
                groupFieldIds: ['composer_result_status'],
                metricId: 'composer_result_revenue',
            },
        });
        expect(pivotColumns).toEqual([]);
    });

    test('funnel draws y[0] by x', () => {
        const { chartConfig } = chart(
            viz({ type: 'funnel', x: 'status', y: ['revenue'] }),
        );
        expect(chartConfig).toMatchObject({
            type: ChartType.FUNNEL,
            config: { fieldId: 'composer_result_revenue' },
        });
    });

    test('big_number selects y[0] with labels.y', () => {
        const result = chart(
            viz({
                type: 'big_number',
                y: ['order_count'],
                labels: { x: null, y: 'Orders', y2: null },
            }),
        );
        expect(result.metricQuery.dimensions).toEqual([]);
        expect(result.metricQuery.metrics).toEqual([
            'composer_result_order_count',
        ]);
        expect(result.chartConfig).toEqual({
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: 'composer_result_order_count',
                showBigNumberLabel: true,
                showTableNamesInLabel: false,
                label: 'Orders',
            },
        });
    });

    test('table keeps every column, numeric ones as metrics', () => {
        const result = chart(viz({ type: 'table' }));
        expect(result.chartConfig).toEqual({ type: ChartType.TABLE });
        expect(result.metricQuery.dimensions).toEqual([
            'composer_result_orders_month',
            'composer_result_status',
        ]);
        expect(result.metricQuery.metrics).toEqual([
            'composer_result_revenue',
            'composer_result_order_count',
        ]);
        expect(result.pivotColumns).toEqual([]);
    });

    test('custom maps slots to field ids and pivots series slots', () => {
        const result = chart(ribbon, [
            { name: 'x', type: 'dimension' },
            { name: 'series', type: 'series' },
            { name: 'values', type: 'metric' },
        ]);
        expect(result.chartConfig).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 3,
                fieldMapping: {
                    x: 'composer_result_orders_month',
                    series: 'composer_result_status',
                    values: ['composer_result_revenue'],
                },
            },
        });
        expect(result.pivotColumns).toEqual(['composer_result_status']);
        expect(result.metricQuery.metrics).toEqual(['composer_result_revenue']);
    });

    test('an unknown column is rejected', () => {
        expect(() =>
            chart(viz({ type: 'bar', x: 'missing', y: ['revenue'] })),
        ).toThrow('Column "missing" is not in the result');
    });
});

describe('getComposerChartStage', () => {
    const stage = (
        config: ComposerStoredChartVizConfig,
        customChartTypeSlots: {
            name: string;
            type: DataAppVizFieldType;
        }[] = [],
    ) =>
        getComposerChartStage({
            vizConfig: config,
            customChartTypeSlots,
            nodeId: 'chart_stage',
            source: 'orders',
        });

    test('is absent without a series split', () => {
        expect(stage(viz({ type: 'line' }))).toBeNull();
        expect(
            stage(viz({ type: 'funnel', x: 'status', y: ['revenue'] })),
        ).toBeNull();
        expect(
            stage(
                viz({
                    type: 'pie',
                    x: 'status',
                    y: ['revenue'],
                    groupBy: ['orders_month'],
                }),
            ),
        ).toBeNull();
    });

    test('renames the charted columns to field ids and pivots the split', () => {
        expect(
            stage(
                viz({
                    type: 'bar',
                    x: 'orders_month',
                    y: ['revenue'],
                    y2: 'order_count',
                    groupBy: ['say "hi"'],
                }),
            ),
        ).toEqual({
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'chart_stage',
            sql: 'SELECT "orders_month" AS "composer_result_orders_month", "say ""hi""" AS "composer_result_say ""hi""", "revenue" AS "composer_result_revenue", "order_count" AS "composer_result_order_count" FROM "node_result"',
            references: { node_result: 'orders' },
            pivotConfiguration: {
                indexColumn: [
                    {
                        reference: 'composer_result_orders_month',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                groupByColumns: [{ reference: 'composer_result_say "hi"' }],
                valuesColumns: [
                    {
                        reference: 'composer_result_revenue',
                        aggregation: VizAggregationOptions.ANY,
                    },
                    {
                        reference: 'composer_result_order_count',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                sortBy: undefined,
            },
        });
    });

    test('a split without explicit x or y is rejected', () => {
        expect(() =>
            stage(viz({ type: 'line', y: ['revenue'], groupBy: ['status'] })),
        ).toThrow('A series split needs explicit x and y columns');
        expect(() =>
            stage(viz({ type: 'bar', x: 'orders_month', groupBy: ['status'] })),
        ).toThrow('A series split needs explicit x and y columns');
    });

    test('custom pivots series slots, metric slots are the values', () => {
        const result = stage(ribbon, [
            { name: 'x', type: 'dimension' },
            { name: 'series', type: 'series' },
            { name: 'values', type: 'metric' },
        ]);
        expect(result?.pivotConfiguration).toMatchObject({
            indexColumn: [{ reference: 'composer_result_orders_month' }],
            groupByColumns: [{ reference: 'composer_result_status' }],
            valuesColumns: [{ reference: 'composer_result_revenue' }],
        });
    });
});

describe('toComposerResultRows', () => {
    test('keys rows by field id and keeps only the charted columns', () => {
        const result = chart(
            viz({ type: 'funnel', x: 'status', y: ['revenue'] }),
        );
        const value = (raw: unknown) => ({
            value: { raw, formatted: String(raw) },
        });
        expect(
            toComposerResultRows(result, [
                {
                    orders_month: value('2024-01-01'),
                    status: value('completed'),
                    revenue: value(10),
                    order_count: value(2),
                },
            ]),
        ).toEqual([
            {
                composer_result_status: value('completed'),
                composer_result_revenue: value(10),
            },
        ]);
    });
});
