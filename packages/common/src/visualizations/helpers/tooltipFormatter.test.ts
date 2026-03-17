import { VizAggregationOptions, type EChartsSeries } from '../types';
import {
    findPivotColumnFromSeriesRef,
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
