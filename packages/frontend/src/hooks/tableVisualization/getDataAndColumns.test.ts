import { describe, expect, it } from 'vitest';
import { findMatchingSubtotal } from './getDataAndColumns';

const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });
const headerValue = (raw: unknown) => ({ raw, formatted: String(raw) });

const records = (...rows: Record<string, unknown>[]) =>
    rows as unknown as Record<string, number>[];

describe('findMatchingSubtotal', () => {
    it('matches a date grouping dimension regardless of millisecond serialization', () => {
        const recs = records({
            orders_order_date_month: '2018-04-01T00:00:00.000Z',
            payments_total_revenue: 139,
        });

        const match = findMatchingSubtotal(
            recs,
            { orders_order_date_month: cell('2018-04-01T00:00:00Z') },
            {},
        );

        expect(match).toBe(recs[0]);
    });

    it('matches when the cell raw has milliseconds and the record does not', () => {
        const recs = records({
            orders_order_date_month: '2018-04-01T00:00:00Z',
            payments_total_revenue: 139,
        });

        const match = findMatchingSubtotal(
            recs,
            { orders_order_date_month: cell('2018-04-01T00:00:00.000Z') },
            {},
        );

        expect(match).toBe(recs[0]);
    });

    it('matches a pivoted header dimension value alongside the grouping value', () => {
        const recs = records(
            {
                orders_order_date_month: '2018-01-01T00:00:00.000Z',
                orders_status: 'completed',
                payments_total_revenue: 424,
            },
            {
                orders_order_date_month: '2018-01-01T00:00:00.000Z',
                orders_status: 'returned',
                payments_total_revenue: 49,
            },
        );

        const match = findMatchingSubtotal(
            recs,
            { orders_order_date_month: cell('2018-01-01T00:00:00Z') },
            { orders_status: headerValue('returned') },
        );

        expect(match).toBe(recs[1]);
    });

    it('returns undefined when no record matches', () => {
        const recs = records({
            orders_order_date_month: '2018-04-01T00:00:00.000Z',
            payments_total_revenue: 139,
        });

        const match = findMatchingSubtotal(
            recs,
            { orders_order_date_month: cell('2017-01-01T00:00:00Z') },
            {},
        );

        expect(match).toBeUndefined();
    });

    it('returns undefined when there are no records', () => {
        expect(
            findMatchingSubtotal(
                undefined,
                { orders_order_date_month: cell('2018-04-01T00:00:00Z') },
                {},
            ),
        ).toBeUndefined();
    });
});
