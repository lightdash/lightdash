import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '../../../../../types/field';
import { VizAggregationOptions } from '../../../../../visualizations/types';
import {
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
} from '../../../schemas';
import { getWarehousePivotedResults } from '../getWarehousePivotedResults';
import { getRunQueryEchartsConfig } from './getRunQueryEchartsConfig';

const fieldsMap = Object.fromEntries(
    [
        ['order_date', 'Order date', FieldType.DIMENSION, DimensionType.DATE],
        ['status', 'Status', FieldType.DIMENSION, DimensionType.STRING],
        ['count', 'Count', FieldType.METRIC, MetricType.COUNT],
        ['revenue', 'Revenue', FieldType.METRIC, MetricType.SUM],
    ].map(([name, label, fieldType, type]) => [
        `orders_${name}`,
        { fieldType, type, name, label, table: 'orders', sql: '' },
    ]),
) as unknown as ItemsMap;

const makeQueryTool = (
    chartConfig: Partial<ToolRunQueryBuiltinChartConfig>,
): ToolRunQueryArgsTransformed => ({
    title: 'Orders by status',
    description: 'Orders count by status',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_order_date', 'orders_status'],
        metrics: ['orders_count'],
        sorts: [],
        limit: 500,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
        filters: {},
    },
    chartConfig: {
        defaultVizType: 'bar',
        xAxisDimension: 'orders_order_date',
        yAxisMetrics: ['orders_count'],
        groupBy: ['orders_status'],
        xAxisType: null,
        stackBars: null,
        lineType: null,
        xAxisLabel: 'Order date',
        yAxisLabel: 'Count',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
        ...chartConfig,
    },
    mergeConfig: null,
});

const valuesColumn = (referenceField: string, status: string) => ({
    referenceField,
    pivotColumnName: `${referenceField}_any_${status}`,
    aggregation: VizAggregationOptions.ANY,
    pivotValues: [{ referenceField: 'orders_status', value: status }],
});

// Keys and labels come only from the pivot, never from the rows passed in
const warehousePivot = getWarehousePivotedResults({
    rows: [
        {
            orders_order_date: '2024-01-01',
            orders_count_any_completed: 1,
            orders_count_any_pending: 2,
            orders_revenue_any_completed: 10,
            orders_revenue_any_pending: 20,
        },
    ],
    fieldsMap,
    valuesColumns: [
        valuesColumn('orders_count', 'completed'),
        valuesColumn('orders_count', 'pending'),
        valuesColumn('orders_revenue', 'completed'),
        valuesColumn('orders_revenue', 'pending'),
    ],
    parameters: null,
    timezone: null,
});

const getSeries = async (
    chartConfig: Partial<ToolRunQueryBuiltinChartConfig>,
) => {
    const option = await getRunQueryEchartsConfig(
        makeQueryTool(chartConfig),
        {
            rows: [{ orders_order_date: '2024-01-01', orders_status: 'x' }],
            fields: fieldsMap,
        },
        warehousePivot,
    );
    return (
        (option?.series ?? []) as {
            name: string;
            yAxisIndex?: number;
            encode: { x: string; y: string };
        }[]
    ).map(({ name, yAxisIndex, encode }) => [
        name,
        yAxisIndex,
        // horizontal bars put the metric on the x axis
        chartConfig.defaultVizType === 'horizontal' ? encode.x : encode.y,
    ]);
};

// Horizontal and scatter charts have a single value axis
const primarySeries = (yAxisIndex: number | undefined) => [
    ['completed', yAxisIndex, 'orders_count_any_completed'],
    ['pending', yAxisIndex, 'orders_count_any_pending'],
];

describe('getRunQueryEchartsConfig pivoted series', () => {
    it.each([
        ['bar', 0],
        ['horizontal', undefined],
        ['line', 0],
        ['scatter', undefined],
    ] as const)(
        'names %s series with the pivot labels and keys',
        async (defaultVizType, yAxisIndex) => {
            expect(await getSeries({ defaultVizType })).toEqual(
                primarySeries(yAxisIndex),
            );
        },
    );

    it.each(['bar', 'line'] as const)(
        'draws one %s series per returned secondary key on the secondary axis',
        async (defaultVizType) => {
            expect(
                await getSeries({
                    defaultVizType,
                    secondaryYAxisMetric: 'orders_revenue',
                }),
            ).toEqual([
                ['[completed] Count', 0, 'orders_count_any_completed'],
                ['[pending] Count', 0, 'orders_count_any_pending'],
                ['[completed] Revenue', 1, 'orders_revenue_any_completed'],
                ['[pending] Revenue', 1, 'orders_revenue_any_pending'],
            ]);
        },
    );

    it.each(['horizontal', 'scatter'] as const)(
        'keeps ignoring the secondary axis metric on %s charts',
        async (defaultVizType) => {
            expect(
                await getSeries({
                    defaultVizType,
                    secondaryYAxisMetric: 'orders_revenue',
                }),
            ).toEqual(primarySeries(undefined));
        },
    );
});
