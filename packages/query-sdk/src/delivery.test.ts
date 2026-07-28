import { describe, expect, it, vi } from 'vitest';
import { toDeliveryQuery } from './delivery';
import { query } from './query';
import { savedChart } from './savedChart';

describe('toDeliveryQuery', () => {
    it('builds a declaration from a QueryBuilder, carrying the built definition', () => {
        const q = query('orders')
            .label('Revenue by Segment')
            .dimensions(['customer_segment'])
            .metrics(['total_revenue'])
            .limit(250);

        expect(toDeliveryQuery(q)).toEqual({
            kind: 'query',
            label: 'Revenue by Segment',
            query: q.build(),
        });
    });

    it('prefers an explicit name over the query label', () => {
        const q = query('orders').label('From label');
        expect(toDeliveryQuery(q, 'From argument')?.label).toBe('From argument');
    });

    it('falls back to a null label when the query has none', () => {
        expect(toDeliveryQuery(query('orders'))?.label).toBeNull();
    });

    it('skips a saved chart with a warning rather than throwing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(toDeliveryQuery(savedChart('chart-1'))).toBeNull();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
