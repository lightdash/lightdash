import { describe, expect, it } from 'vitest';
import { suggestClosestFieldIds } from './suggestClosestFieldIds';

const candidates = [
    'orders_status',
    'orders_total_revenue',
    'customers_status',
    'customers_country',
];

describe('suggestClosestFieldIds', () => {
    it('ranks the closest field ids first by shared tokens', () => {
        // Target shares "orders" + "status" with orders_status.
        expect(
            suggestClosestFieldIds('orders_order_status', candidates)[0],
        ).toBe('orders_status');
    });

    it('returns every candidate that shares a token, ranked', () => {
        // "status" matches both *_status fields; nothing else.
        expect(suggestClosestFieldIds('status', candidates)).toEqual([
            'customers_status',
            'orders_status',
        ]);
    });

    it('respects the limit', () => {
        expect(
            suggestClosestFieldIds('orders_status', candidates, 1),
        ).toHaveLength(1);
    });

    it('returns [] when nothing overlaps', () => {
        expect(suggestClosestFieldIds('foo_bar', candidates)).toEqual([]);
    });

    it('is deterministic for equal scores (alphabetical)', () => {
        // Both share exactly the "status" token → tie → alphabetical order.
        expect(suggestClosestFieldIds('status', candidates)).toEqual([
            'customers_status',
            'orders_status',
        ]);
    });
});
