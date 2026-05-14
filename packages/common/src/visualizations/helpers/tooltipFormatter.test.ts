import { VizAggregationOptions, type EChartsSeries } from '../types';
import {
    findPivotColumnFromSeriesRef,
    transformToPercentageStacking,
    translatePivotRef,
} from './tooltipFormatter';

describe('translatePivotRef', () => {
    const pivotValuesColumnsMap = {
        orders_unique_order_count_any_completed: {
            referenceField: 'orders_unique_order_count',
            pivotColumnName: 'orders_unique_order_count_any_completed',
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    referenceField: 'orders_status',
                    value: 'completed',
                    formatted: 'completed',
                },
            ],
        },
        orders_unique_order_count_any_shipped: {
            referenceField: 'orders_unique_order_count',
            pivotColumnName: 'orders_unique_order_count_any_shipped',
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    referenceField: 'orders_status',
                    value: 'shipped',
                    formatted: 'shipped',
                },
            ],
        },
    };

    it('returns undefined when pivotValuesColumnsMap is undefined', () => {
        expect(translatePivotRef('metric.dim.val', undefined)).toBeUndefined();
    });

    it('returns undefined for invalid ref format (less than 3 parts)', () => {
        expect(
            translatePivotRef('metric', pivotValuesColumnsMap),
        ).toBeUndefined();
        expect(
            translatePivotRef('metric.dim', pivotValuesColumnsMap),
        ).toBeUndefined();
    });

    it('returns undefined for invalid ref format (even number of parts)', () => {
        expect(
            translatePivotRef('metric.dim.val.extra', pivotValuesColumnsMap),
        ).toBeUndefined();
    });

    it('translates pivot ref to SQL pivot column name', () => {
        expect(
            translatePivotRef(
                'orders_unique_order_count.orders_status.completed',
                pivotValuesColumnsMap,
            ),
        ).toBe('orders_unique_order_count_any_completed');

        expect(
            translatePivotRef(
                'orders_unique_order_count.orders_status.shipped',
                pivotValuesColumnsMap,
            ),
        ).toBe('orders_unique_order_count_any_shipped');
    });

    it('returns undefined when metric does not match', () => {
        expect(
            translatePivotRef(
                'unknown_metric.orders_status.completed',
                pivotValuesColumnsMap,
            ),
        ).toBeUndefined();
    });

    it('returns undefined when pivot value does not match', () => {
        expect(
            translatePivotRef(
                'orders_unique_order_count.orders_status.pending',
                pivotValuesColumnsMap,
            ),
        ).toBeUndefined();
    });

    it('returns undefined when pivot dimension does not match', () => {
        expect(
            translatePivotRef(
                'orders_unique_order_count.wrong_dimension.completed',
                pivotValuesColumnsMap,
            ),
        ).toBeUndefined();
    });
});

describe('findPivotColumnFromSeriesRef', () => {
    const pivotValuesColumnsMap = {
        order_count_any_shipped: {
            referenceField: 'order_count',
            pivotColumnName: 'order_count_any_shipped',
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    referenceField: 'orders_status',
                    value: 'shipped',
                    formatted: 'shipped',
                },
            ],
        },
        pct_of_total_any_shipped: {
            referenceField: 'pct_of_total',
            pivotColumnName: 'pct_of_total_any_shipped',
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    referenceField: 'orders_status',
                    value: 'shipped',
                    formatted: 'shipped',
                },
            ],
        },
        order_count_any_completed: {
            referenceField: 'order_count',
            pivotColumnName: 'order_count_any_completed',
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    referenceField: 'orders_status',
                    value: 'completed',
                    formatted: 'completed',
                },
            ],
        },
        pct_of_total_any_completed: {
            referenceField: 'pct_of_total',
            pivotColumnName: 'pct_of_total_any_completed',
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    referenceField: 'orders_status',
                    value: 'completed',
                    formatted: 'completed',
                },
            ],
        },
    };

    // Only visible series (the metric) - hidden table calc is NOT in this array
    const visibleSeries: EChartsSeries[] = [
        {
            type: 'bar',
            pivotReference: {
                field: 'order_count',
                pivotValues: [{ field: 'orders_status', value: 'shipped' }],
            },
        } as EChartsSeries,
        {
            type: 'bar',
            pivotReference: {
                field: 'order_count',
                pivotValues: [{ field: 'orders_status', value: 'completed' }],
            },
        } as EChartsSeries,
    ];

    // Hidden table calc pivot references (passed separately)
    const hiddenPivotRefs = [
        {
            field: 'pct_of_total',
            pivotValues: [{ field: 'orders_status', value: 'shipped' }],
        },
        {
            field: 'pct_of_total',
            pivotValues: [{ field: 'orders_status', value: 'completed' }],
        },
    ];

    it('resolves a hidden series (table calc) via hiddenSeriesPivotRefs', () => {
        // User hovers over "order_count - shipped" (series index 0)
        const params = [{ seriesIndex: 0 }];

        const result = findPivotColumnFromSeriesRef(
            'pct_of_total',
            params,
            visibleSeries,
            pivotValuesColumnsMap,
            hiddenPivotRefs,
        );

        expect(result).toBe('pct_of_total_any_shipped');
    });

    it('resolves to the correct pivot value when hovering a different group', () => {
        // User hovers over "order_count - completed" (series index 1)
        const params = [{ seriesIndex: 1 }];

        const result = findPivotColumnFromSeriesRef(
            'pct_of_total',
            params,
            visibleSeries,
            pivotValuesColumnsMap,
            hiddenPivotRefs,
        );

        expect(result).toBe('pct_of_total_any_completed');
    });

    it('does not resolve hidden series without hiddenSeriesPivotRefs', () => {
        const params = [{ seriesIndex: 0 }];

        const result = findPivotColumnFromSeriesRef(
            'pct_of_total',
            params,
            visibleSeries,
            pivotValuesColumnsMap,
        );

        expect(result).toBeUndefined();
    });

    it('resolves a visible series (metric) by matching its own pivot values', () => {
        const params = [{ seriesIndex: 0 }];

        const result = findPivotColumnFromSeriesRef(
            'order_count',
            params,
            visibleSeries,
            pivotValuesColumnsMap,
        );

        expect(result).toBe('order_count_any_shipped');
    });

    it('returns undefined when ref does not match any series', () => {
        const params = [{ seriesIndex: 0 }];

        const result = findPivotColumnFromSeriesRef(
            'unknown_field',
            params,
            visibleSeries,
            pivotValuesColumnsMap,
            hiddenPivotRefs,
        );

        expect(result).toBeUndefined();
    });

    it('returns undefined when series is undefined', () => {
        const params = [{ seriesIndex: 0 }];

        const result = findPivotColumnFromSeriesRef(
            'pct_of_total',
            params,
            undefined,
            pivotValuesColumnsMap,
            hiddenPivotRefs,
        );

        expect(result).toBeUndefined();
    });

    it('resolves hidden series in legacy pivot mode (no pivotValuesColumnsMap)', () => {
        const params = [{ seriesIndex: 0 }];

        const result = findPivotColumnFromSeriesRef(
            'pct_of_total',
            params,
            visibleSeries,
            undefined, // legacy mode
            hiddenPivotRefs,
        );

        // hashFieldReference produces a string from the pivotReference
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
    });
});

describe('transformToPercentageStacking', () => {
    test('converts absolute values to percentages summing to 100 per x bucket', () => {
        const rows = [
            { date: '2024-01-01', a: 3, b: 7 },
            { date: '2024-02-01', a: 1, b: 1 },
        ];

        const { transformedResults, originalValues } =
            transformToPercentageStacking(rows, 'date', ['a', 'b']);

        expect(transformedResults[0].a).toBeCloseTo(30);
        expect(transformedResults[0].b).toBeCloseTo(70);
        expect(transformedResults[1].a).toBeCloseTo(50);
        expect(transformedResults[1].b).toBeCloseTo(50);
        expect(originalValues.get('2024-01-01')?.get('a')).toBe(3);
        expect(originalValues.get('2024-02-01')?.get('b')).toBe(1);
    });

    test('preserves yField absence on gap rows instead of writing explicit 0%', () => {
        // Shape padDatasetForContinuousAxis produces for gap rows:
        // only the xField populated, every yField absent. Writing 0% here
        // would surface as a "0.0% (0)" tooltip line at gap dates.
        const rows: Record<string, unknown>[] = [
            { date: '2024-01-01', a: 3, b: 7 },
            { date: '2024-02-01' }, // gap row from padding
            { date: '2024-03-01', a: 4, b: 6 },
        ];

        const { transformedResults, originalValues } =
            transformToPercentageStacking(rows, 'date', ['a', 'b']);

        // Gap row keeps yFields absent — no NaN, no explicit 0.
        expect('a' in transformedResults[1]).toBe(false);
        expect('b' in transformedResults[1]).toBe(false);
        // originalValues has no entry for the gap xValue.
        expect(originalValues.has('2024-02-01')).toBe(false);
        // Real rows still total 100% — gap rows don't perturb other buckets.
        expect(
            (transformedResults[0].a as number) +
                (transformedResults[0].b as number),
        ).toBeCloseTo(100);
        expect(
            (transformedResults[2].a as number) +
                (transformedResults[2].b as number),
        ).toBeCloseTo(100);
    });

    test('passes rows through when no yFieldRefs are supplied', () => {
        const rows = [{ date: '2024-01-01', a: 3 }];

        const { transformedResults } = transformToPercentageStacking(
            rows,
            'date',
            [],
        );

        expect(transformedResults[0]).toEqual({ date: '2024-01-01', a: 3 });
    });
});
