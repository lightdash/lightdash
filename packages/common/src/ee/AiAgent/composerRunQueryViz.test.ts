import { DimensionType } from '../../types/field';
import { type ResultColumn } from '../../types/results';
import { ChartType } from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import {
    composerChartVizConfigSchema,
    getComposerRunQueryChart,
    type ComposerChartVizConfig,
    type ComposerStoredChartVizConfig,
} from './composerRunQueryViz';

const columns: ResultColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    { reference: 'orders_status', type: DimensionType.STRING },
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
        xAxisType: null,
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

const chart = (config: ComposerStoredChartVizConfig) =>
    getComposerRunQueryChart({
        columns,
        vizConfig: config,
        metadata: { title: '', description: '' },
        customChartTypeSeriesSlots: [],
    });

describe('getComposerRunQueryChart', () => {
    test('bar + groupBy pivots the groupBy columns', () => {
        const result = chart(
            viz({
                type: 'bar',
                x: 'orders_month',
                y: ['revenue'],
                groupBy: ['orders_status'],
            }),
        );
        expect(result.metricQuery.dimensions).toEqual([
            'orders_month',
            'orders_status',
        ]);
        expect(result.metricQuery.metrics).toEqual(['revenue']);
        expect(result.fields.orders_month).toMatchObject({
            type: DimensionType.DATE,
            table: 'orders',
            name: 'month',
        });
        expect(result.chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_month', yField: ['revenue'] },
                eChartsConfig: { series: [{ type: 'bar' }] },
            },
        });
        expect(result.pivotColumns).toEqual(['orders_status']);
        expect(result.pivotConfiguration).toMatchObject({
            indexColumn: [{ reference: 'orders_month' }],
            groupByColumns: [{ reference: 'orders_status' }],
            valuesColumns: [{ reference: 'revenue' }],
        });
    });

    test('area + stack is a stacked line with area style', () => {
        const { chartConfig } = chart(
            viz({
                type: 'area',
                x: 'orders_month',
                y: ['revenue'],
                groupBy: ['orders_status'],
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
    });

    test('horizontal bar flips axes', () => {
        const { chartConfig } = chart(
            viz({
                type: 'bar',
                horizontal: true,
                x: 'orders_status',
                y: ['revenue'],
            }),
        );
        expect(chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: { layout: { flipAxes: true } },
        });
    });

    test('y2 goes on the secondary axis', () => {
        const { chartConfig, metricQuery } = chart(
            viz({
                type: 'line',
                x: 'orders_month',
                y: ['revenue'],
                y2: ['order_count'],
            }),
        );
        expect(metricQuery.metrics).toEqual(['revenue', 'order_count']);
        expect(chartConfig).toMatchObject({
            config: {
                eChartsConfig: {
                    series: [{ yAxisIndex: 0 }, { yAxisIndex: 1 }],
                },
            },
        });
    });

    test('area y2 is an unstacked line', () => {
        const { chartConfig } = chart(
            viz({
                type: 'area',
                x: 'orders_month',
                y: ['revenue'],
                y2: ['order_count'],
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

    test('y2 overlapping y throws', () => {
        expect(() =>
            chart(
                viz({
                    type: 'bar',
                    x: 'orders_status',
                    y: ['revenue'],
                    y2: ['revenue'],
                }),
            ),
        ).toThrow('y2 must not overlap y: revenue');
    });

    test('big_number selects y[0]', () => {
        const result = chart(
            viz({
                type: 'big_number',
                y: ['order_count'],
                labels: { x: null, y: 'Orders', y2: null },
            }),
        );
        expect(result.metricQuery.dimensions).toEqual([]);
        expect(result.metricQuery.metrics).toEqual(['order_count']);
        expect(result.chartConfig).toEqual({
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: 'order_count',
                showBigNumberLabel: true,
                showTableNamesInLabel: false,
                label: 'Orders',
            },
        });
    });

    test('table splits columns into dimensions and metrics', () => {
        const result = chart(viz({ type: 'table' }));
        expect(result.chartConfig).toEqual({ type: ChartType.TABLE });
        expect(result.metricQuery.dimensions).toEqual([
            'orders_month',
            'orders_status',
        ]);
        expect(result.metricQuery.metrics).toEqual(['revenue', 'order_count']);
        expect(result.pivotConfiguration).toBeNull();
    });
});
