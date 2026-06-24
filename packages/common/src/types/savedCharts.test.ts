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
    type: CartesianSeriesType.LINE,
    stack: field,
    encode: {
        xRef: { field: 'orders_date' },
        yRef: {
            field,
            pivotValues: [{ field: pivotField, value: pivotValue }],
        },
        x: 'orders_date',
        y: `${field}.${pivotField}.${pivotValue}`,
    },
    ...overrides,
});

const cartesianConfig = (series: Series[]): CartesianChartConfig => ({
    type: ChartType.CARTESIAN,
    config: {
        layout: { xField: 'orders_date', yField: ['orders_count'] },
        eChartsConfig: { series },
    },
});

describe('removePivotedSeriesValuesFromChartConfig', () => {
    it('strips data-level pivot values and dedupes pivoted series', () => {
        const config = cartesianConfig([
            pivotedSeries('orders_count', 'orders_status', 'completed', {
                name: 'completed',
                color: '#ff0000',
            }),
            pivotedSeries('orders_count', 'orders_status', 'placed', {
                name: 'placed',
                color: '#00ff00',
            }),
            pivotedSeries('orders_count', 'orders_status', 'shipped', {
                name: 'shipped',
                color: '#0000ff',
            }),
        ]);

        const result = removePivotedSeriesValuesFromChartConfig(
            config,
        ) as CartesianChartConfig;

        const series = result.config!.eChartsConfig.series!;
        expect(series).toHaveLength(1);
        expect(series[0].encode.yRef).toEqual({ field: 'orders_count' });
        expect(series[0].encode.yRef.pivotValues).toBeUndefined();
        // computed hashes and data-specific name/color are dropped
        expect(series[0].encode.x).toBeUndefined();
        expect(series[0].encode.y).toBeUndefined();
        expect(series[0].name).toBeUndefined();
        expect(series[0].color).toBeUndefined();
        // chart-level styling that drives regeneration is preserved
        expect(series[0].type).toBe(CartesianSeriesType.LINE);
        expect(series[0].stack).toBe('orders_count');
    });

    it('keeps multiple metrics as separate portable series', () => {
        const config = cartesianConfig([
            pivotedSeries('orders_count', 'orders_status', 'completed'),
            pivotedSeries('orders_count', 'orders_status', 'placed'),
            pivotedSeries('orders_total', 'orders_status', 'completed'),
        ]);

        const result = removePivotedSeriesValuesFromChartConfig(
            config,
        ) as CartesianChartConfig;

        const series = result.config!.eChartsConfig.series!;
        expect(series).toHaveLength(2);
        expect(series.map((s) => s.encode.yRef.field)).toEqual([
            'orders_count',
            'orders_total',
        ]);
    });

    it('leaves non-pivoted series (and their customizations) untouched', () => {
        const nonPivotedSeries: Series = {
            type: CartesianSeriesType.BAR,
            encode: {
                xRef: { field: 'orders_date' },
                yRef: { field: 'orders_count' },
            },
            name: 'Order count',
            color: '#abcabc',
        };
        const config = cartesianConfig([nonPivotedSeries]);

        const result = removePivotedSeriesValuesFromChartConfig(
            config,
        ) as CartesianChartConfig;

        expect(result.config!.eChartsConfig.series).toEqual([nonPivotedSeries]);
    });

    it('returns non-cartesian configs unchanged', () => {
        const config: ChartConfig = {
            type: ChartType.BIG_NUMBER,
            config: { selectedField: 'orders_count' },
        };

        expect(removePivotedSeriesValuesFromChartConfig(config)).toBe(config);
    });

    it('handles missing or empty series', () => {
        const emptyConfig = cartesianConfig([]);
        expect(removePivotedSeriesValuesFromChartConfig(emptyConfig)).toBe(
            emptyConfig,
        );
    });
});
