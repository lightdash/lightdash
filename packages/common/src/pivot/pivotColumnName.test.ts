import { VizAggregationOptions } from '../visualizations/types';
import {
    getPivotValueColumnBaseName,
    getPivotValueColumnName,
    NULL_PIVOT_KEY,
} from './pivotColumnName';

describe('getPivotValueColumnBaseName', () => {
    it('suffixes the reference with the aggregation', () => {
        expect(
            getPivotValueColumnBaseName(
                'orders_total_order_amount',
                VizAggregationOptions.SUM,
            ),
        ).toBe('orders_total_order_amount_sum');
    });
});

describe('getPivotValueColumnName', () => {
    it('returns the base name when there are no group-by values', () => {
        expect(
            getPivotValueColumnName('views', VizAggregationOptions.SUM, []),
        ).toBe('views_sum');
    });

    it('appends a single group-by value', () => {
        expect(
            getPivotValueColumnName(
                'payments_total_revenue',
                VizAggregationOptions.ANY,
                ['bank_transfer'],
            ),
        ).toBe('payments_total_revenue_any_bank_transfer');
    });

    it('appends multiple group-by values in order', () => {
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, [
                'a',
                'b',
            ]),
        ).toBe('value_any_a_b');
    });

    it('substitutes the null placeholder for null and undefined values', () => {
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, [null]),
        ).toBe(`value_any_${NULL_PIVOT_KEY}`);
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, [
                undefined,
            ]),
        ).toBe(`value_any_${NULL_PIVOT_KEY}`);
    });

    it('substitutes the null placeholder per value, keeping the others', () => {
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, [
                'a',
                null,
                'b',
            ]),
        ).toBe(`value_any_a_${NULL_PIVOT_KEY}_b`);
    });

    it('keeps a single empty-string group-by value on the unsuffixed base name', () => {
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, ['']),
        ).toBe('value_any');
    });

    it('does not collide a null group-by value with the base name', () => {
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, [null]),
        ).not.toBe(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, []),
        );
    });

    it('stringifies non-string group-by values', () => {
        expect(
            getPivotValueColumnName('value', VizAggregationOptions.ANY, [
                false,
                7,
            ]),
        ).toBe('value_any_false_7');
    });
});
