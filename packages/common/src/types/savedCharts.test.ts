import {
    CartesianSeriesType,
    ChartType,
    removePivotedSeriesValuesFromChartConfig,
    type CartesianChartConfig,
    type ChartConfig,
    type Series,
} from './savedCharts';

const pivotedSeries = (
    field: string,
    pivotField: string,
    pivotValue: string,
    overrides: Partial<Series> = {},
): Series => ({
    type: CartesianSeriesType.BAR,
    stack: 'default',
    isFilteredOut: true,
    encode: {
        xRef: { field: 'orders_created_date' },
        yRef: {
            field,
            pivotValues: [{ field: pivotField, value: pivotValue }],
        },
        x: 'orders_created_date',
        y: `${field}.${pivotField}.${pivotValue}`,
    },
    ...overrides,
});

const cartesianConfig = (series: Series[]): CartesianChartConfig => ({
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'orders_created_date',
            yField: ['orders_count'],
        },
        eChartsConfig: {
            series,
        },
    },
});

describe('removePivotedSeriesValuesFromChartConfig', () => {
    it('strips data-level pivot values and dedupes pivoted series', () => {
        const result = removePivotedSeriesValuesFromChartConfig(
            cartesianConfig([
                pivotedSeries('orders_count', 'orders_status', 'completed', {
                    name: 'Completed orders',
                    color: '#1f77b4',
                }),
                pivotedSeries('orders_count', 'orders_status', 'returned', {
                    name: 'Returned orders',
                    color: '#d62728',
                    isFilteredOut: false,
                }),
            ]),
        );

        expect(result.type).toBe(ChartType.CARTESIAN);
        const series = (result as CartesianChartConfig).config?.eChartsConfig
            .series;
        expect(series).toHaveLength(1);
        expect(series?.[0]).toEqual(
            expect.objectContaining({
                type: CartesianSeriesType.BAR,
                stack: 'default',
                isFilteredOut: true,
            }),
        );
        expect(series?.[0].name).toBeUndefined();
        expect(series?.[0].color).toBeUndefined();
        expect(series?.[0].encode).toEqual({
            xRef: { field: 'orders_created_date' },
            yRef: { field: 'orders_count' },
        });
    });

    it('keeps multiple metrics separate', () => {
        const result = removePivotedSeriesValuesFromChartConfig(
            cartesianConfig([
                pivotedSeries('orders_count', 'orders_status', 'completed'),
                pivotedSeries('orders_total', 'orders_status', 'completed'),
            ]),
        );

        const series = (result as CartesianChartConfig).config?.eChartsConfig
            .series;
        expect(series).toHaveLength(2);
        expect(series?.map((s) => s.encode.yRef.field)).toEqual([
            'orders_count',
            'orders_total',
        ]);
    });

    it('leaves non-pivoted series customizations untouched', () => {
        const nonPivoted = pivotedSeries(
            'orders_count',
            'orders_status',
            'completed',
            {
                color: '#2ca02c',
                name: 'Orders count',
                encode: {
                    xRef: { field: 'orders_created_date' },
                    yRef: { field: 'orders_count' },
                    x: 'orders_created_date',
                    y: 'orders_count',
                },
            },
        );
        const result = removePivotedSeriesValuesFromChartConfig(
            cartesianConfig([nonPivoted]),
        );

        const series = (result as CartesianChartConfig).config?.eChartsConfig
            .series;
        expect(series).toEqual([nonPivoted]);
    });

    it('returns non-cartesian configs unchanged', () => {
        const config = {
            type: ChartType.TABLE,
            config: { columns: {} },
        } as ChartConfig;

        expect(removePivotedSeriesValuesFromChartConfig(config)).toBe(config);
    });

    it('handles missing or empty series', () => {
        const missingSeries = {
            type: ChartType.CARTESIAN,
            config: {
                layout: {},
                eChartsConfig: {},
            },
        } as CartesianChartConfig;
        const emptySeries = cartesianConfig([]);

        expect(removePivotedSeriesValuesFromChartConfig(missingSeries)).toBe(
            missingSeries,
        );
        expect(removePivotedSeriesValuesFromChartConfig(emptySeries)).toBe(
            emptySeries,
        );
    });
});
