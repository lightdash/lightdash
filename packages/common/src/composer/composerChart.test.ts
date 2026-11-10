import { DimensionType, FieldType, MetricType } from '../types/field';
import { QuerySourceType } from '../types/querySources';
import { type ResultColumn } from '../types/results';
import { ChartType, type ChartConfig } from '../types/savedCharts';
import { TimeFrames } from '../types/timeFrames';
import { VizAggregationOptions, VizIndexType } from '../visualizations/types';
import {
    getComposerChartRunQueryChart,
    getComposerChartSeriesSplitStage,
} from './composerChart';

const columns: ResultColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.TIMESTAMP,
        timeInterval: TimeFrames.MONTH,
    },
    { reference: 'status', type: DimensionType.STRING, label: 'Order status' },
    { reference: 'revenue', type: DimensionType.NUMBER },
    { reference: 'order_count', type: DimensionType.NUMBER },
];

const barOverMonths: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'composer_result_orders_month',
            yField: ['composer_result_revenue', 'composer_result_order_count'],
        },
        eChartsConfig: { series: [] },
    },
};

describe('getComposerChartSeriesSplitStage', () => {
    const stage = (
        chartConfig: ChartConfig,
        pivotColumns: string[] | undefined,
    ) =>
        getComposerChartSeriesSplitStage({
            chartVisualization: {
                chartConfig,
                pivotConfig: pivotColumns
                    ? { columns: pivotColumns }
                    : undefined,
            },
            nodeId: 'chart_stage',
            source: 'by_status',
        });

    test('is absent without pivot columns', () => {
        expect(stage(barOverMonths, undefined)).toBeNull();
        expect(stage(barOverMonths, [])).toBeNull();
    });

    test('renames the charted columns back to field ids and pivots the stored split', () => {
        expect(stage(barOverMonths, ['composer_result_say "hi"'])).toEqual({
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'chart_stage',
            sql: 'SELECT "orders_month" AS "composer_result_orders_month", "say ""hi""" AS "composer_result_say ""hi""", "revenue" AS "composer_result_revenue", "order_count" AS "composer_result_order_count" FROM "node_result"',
            references: { node_result: 'by_status' },
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

    test('a split needs a cartesian chart with x and y fields', () => {
        expect(() =>
            stage(
                {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: { yField: ['composer_result_revenue'] },
                        eChartsConfig: { series: [] },
                    },
                },
                ['composer_result_status'],
            ),
        ).toThrow('A series split needs a cartesian chart with x and y fields');
        expect(() =>
            stage({ type: ChartType.PIE, config: {} }, [
                'composer_result_status',
            ]),
        ).toThrow('A series split needs a cartesian chart with x and y fields');
    });

    test('a field id outside the composer result cannot be split on', () => {
        expect(() => stage(barOverMonths, ['orders_status'])).toThrow(
            '"orders_status" is not a composer result field',
        );
    });
});

describe('getComposerChartRunQueryChart', () => {
    const chart = (
        chartConfig: ChartConfig,
        pivotColumns?: string[],
        liveColumns: ResultColumn[] = columns,
    ) =>
        getComposerChartRunQueryChart({
            chartVisualization: {
                chartConfig,
                pivotConfig: pivotColumns
                    ? { columns: pivotColumns }
                    : undefined,
            },
            columns: liveColumns,
        });

    test('a cartesian chart reads x and the split as dimensions and y as metrics, typed by the live columns', () => {
        const result = chart(barOverMonths, ['composer_result_status']);
        expect(result.metricQuery).toMatchObject({
            exploreName: 'composer_result',
            dimensions: [
                'composer_result_orders_month',
                'composer_result_status',
            ],
            metrics: ['composer_result_revenue', 'composer_result_order_count'],
        });
        expect(result.pivotColumns).toEqual(['composer_result_status']);
        expect(result.chartConfig).toBe(barOverMonths);
        expect(result.fields).toEqual({
            composer_result_orders_month: expect.objectContaining({
                fieldType: FieldType.DIMENSION,
                type: DimensionType.DATE,
                timeInterval: TimeFrames.MONTH,
                name: 'orders_month',
                label: 'Orders month',
            }),
            composer_result_status: expect.objectContaining({
                fieldType: FieldType.DIMENSION,
                type: DimensionType.STRING,
                label: 'Order status',
            }),
            composer_result_revenue: expect.objectContaining({
                fieldType: FieldType.METRIC,
                type: MetricType.NUMBER,
            }),
            composer_result_order_count: expect.objectContaining({
                fieldType: FieldType.METRIC,
            }),
        });
    });

    test('a table reads every live column, numeric ones as metrics', () => {
        const result = chart({ type: ChartType.TABLE, config: undefined });
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

    test('big number, pie and funnel read the fields their config names', () => {
        expect(
            chart({
                type: ChartType.BIG_NUMBER,
                config: { selectedField: 'composer_result_revenue' },
            }).metricQuery,
        ).toMatchObject({
            dimensions: [],
            metrics: ['composer_result_revenue'],
        });
        expect(
            chart({
                type: ChartType.PIE,
                config: {
                    groupFieldIds: ['composer_result_status'],
                    metricId: 'composer_result_order_count',
                },
            }).metricQuery,
        ).toMatchObject({
            dimensions: ['composer_result_status'],
            metrics: ['composer_result_order_count'],
        });
        // A funnel's stage labels come from the first non-numeric column.
        expect(
            chart({
                type: ChartType.FUNNEL,
                config: { fieldId: 'composer_result_revenue' },
            }).metricQuery,
        ).toMatchObject({
            dimensions: ['composer_result_orders_month'],
            metrics: ['composer_result_revenue'],
        });
    });

    test('a configured field the run did not return is an error, not an empty chart', () => {
        expect(() =>
            chart(barOverMonths, undefined, [
                { reference: 'orders_month', type: DimensionType.TIMESTAMP },
                { reference: 'revenue', type: DimensionType.NUMBER },
            ]),
        ).toThrow('Column "composer_result_order_count" is not in the result');
    });

    test('chart types a composer chart cannot store are refused by name', () => {
        expect(() =>
            chart({
                type: ChartType.DATA_APP_VIZ,
                config: { dataAppVizUuid: 'viz', fieldMapping: {} },
            }),
        ).toThrow('Custom chart types are not supported on composer charts');
        expect(() => chart({ type: ChartType.TREEMAP, config: {} })).toThrow(
            'treemap charts are not supported on composer charts',
        );
    });
});
