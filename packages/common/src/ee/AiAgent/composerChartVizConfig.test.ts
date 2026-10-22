import { DimensionType } from '../../types/field';
import { type ResultColumn } from '../../types/results';
import { ChartType } from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import {
    composerChartVizConfigSchema,
    getComposerChartStage,
    getComposerRunQueryChart,
    type ComposerChartVizConfig,
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
    config: Partial<ComposerChartVizConfig> &
        Pick<ComposerChartVizConfig, 'type'>,
): ComposerStoredChartVizConfig => ({
    ...composerChartVizConfigSchema.parse({
        x: null,
        y: null,
        groupBy: null,
        stack: null,
        horizontal: null,
        y2: null,
        labels: null,
        customChartTypeSlug: null,
        fieldMapping: null,
        options: null,
        ...config,
    }),
    dataAppVizUuid: null,
    dataAppVizVersion: null,
});

const chart = (
    config: ComposerStoredChartVizConfig,
    customChartTypeSeriesSlots: string[] = [],
) =>
    getComposerRunQueryChart({
        columns,
        vizConfig: config,
        metadata: { title: '', description: '' },
        customChartTypeSeriesSlots,
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
        expect(result.pivotConfiguration).toMatchObject({
            indexColumn: [{ reference: 'composer_result_orders_month' }],
            groupByColumns: [{ reference: 'composer_result_status' }],
            valuesColumns: [{ reference: 'composer_result_revenue' }],
        });
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
        const { metricQuery, chartConfig, pivotConfiguration } = chart(
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
        expect(pivotConfiguration).toBeNull();
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
        const { chartConfig, metricQuery, pivotConfiguration } = chart(
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
        expect(pivotConfiguration).toBeNull();
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
        expect(result.pivotConfiguration).toBeNull();
    });

    test('custom maps slots to field ids and pivots series slots', () => {
        const result = chart(
            {
                ...viz({
                    type: 'custom',
                    customChartTypeSlug: 'ribbon',
                    fieldMapping: {
                        x: 'orders_month',
                        series: 'status',
                        values: ['revenue'],
                    },
                }),
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 3,
            },
            ['series'],
        );
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
        expect(result.pivotConfiguration).toMatchObject({
            groupByColumns: [{ reference: 'composer_result_status' }],
        });
    });

    test('an unknown column is rejected', () => {
        expect(() =>
            chart(viz({ type: 'bar', x: 'missing', y: ['revenue'] })),
        ).toThrow('Column "missing" is not in the result');
    });
});

describe('getComposerChartStage', () => {
    test('renames every node column to its field id', () => {
        const tableColumns: ResultColumn[] = [
            { reference: 'status', type: DimensionType.STRING },
            { reference: 'say "hi"', type: DimensionType.STRING },
        ];
        const stage = getComposerChartStage({
            columns: tableColumns,
            chart: getComposerRunQueryChart({
                columns: tableColumns,
                vizConfig: viz({ type: 'table' }),
                metadata: { title: '', description: '' },
                customChartTypeSeriesSlots: [],
            }),
            sourceName: 'node',
        });
        expect(stage).toEqual({
            sql: 'SELECT "status" AS "composer_result_status", "say ""hi""" AS "composer_result_say ""hi""" FROM "node"',
            pivotConfiguration: null,
        });
    });

    test('selects only the columns the chart uses', () => {
        const stage = getComposerChartStage({
            columns,
            chart: chart(viz({ type: 'funnel', x: 'status', y: ['revenue'] })),
            sourceName: 'node',
        });
        expect(stage.sql).toBe(
            'SELECT "status" AS "composer_result_status", "revenue" AS "composer_result_revenue" FROM "node"',
        );
    });
});
