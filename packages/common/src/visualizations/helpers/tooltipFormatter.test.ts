import { VizAggregationOptions } from '../types';
import { translatePivotRef } from './tooltipFormatter';

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
