import { describe, expect, it } from 'vitest';
import {
    getGrandTotalFieldValues,
    getSubtotalFieldValues,
} from './getTotalsFieldValues';

/**
 * "View underlying data" / "Drill into" from the totals and subtotal rows
 * (#25904).
 *
 * `UnderlyingDataModal` and `combineFilters` build equality filters from the
 * dimension entries of this context and ignore the rest, so these keys decide
 * how wide the resulting query is.
 */
describe('getGrandTotalFieldValues', () => {
    it('carries the metric value only, so no dimension filters are derived', () => {
        const total = { raw: 1467.44, formatted: '$1,467.44' };

        expect(
            getGrandTotalFieldValues('orders_total_order_amount', total),
        ).toEqual({ orders_total_order_amount: total });
    });
});

describe('getSubtotalFieldValues', () => {
    const subtotal = { raw: 782.24, formatted: '$782.24' };

    it("scopes to the group's dimension values", () => {
        expect(
            getSubtotalFieldValues(
                {
                    orders_region: {
                        value: { raw: 'EU', formatted: 'EU' },
                    },
                },
                'orders_total_order_amount',
                subtotal,
            ),
        ).toEqual({
            orders_region: { raw: 'EU', formatted: 'EU' },
            orders_total_order_amount: subtotal,
        });
    });

    it('keeps every grouped dimension for a nested subtotal row', () => {
        expect(
            getSubtotalFieldValues(
                {
                    orders_region: { value: { raw: 'EU', formatted: 'EU' } },
                    orders_shipping_method: {
                        value: { raw: 'express', formatted: 'express' },
                    },
                },
                'orders_total_order_amount',
                subtotal,
            ),
        ).toEqual({
            orders_region: { raw: 'EU', formatted: 'EU' },
            orders_shipping_method: { raw: 'express', formatted: 'express' },
            orders_total_order_amount: subtotal,
        });
    });

    it('drops dimensions with no grouping value rather than filtering on undefined', () => {
        expect(
            getSubtotalFieldValues(
                {
                    orders_region: { value: { raw: 'EU', formatted: 'EU' } },
                    orders_shipping_method: undefined,
                },
                'orders_total_order_amount',
                subtotal,
            ),
        ).not.toHaveProperty('orders_shipping_method');
    });
});
