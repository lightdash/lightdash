import { describe, expect, it, vi } from 'vitest';
import { toDeliveryQuery, useDelivery } from './delivery';
import { query, type QueryBuilder } from './query';
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

    it('builds a declaration from a linked saved chart, carrying run overrides', () => {
        const chart = savedChart('chart-1', 'Linked revenue')
            .limit(1000)
            .parameters({ region: 'EMEA' });

        expect(toDeliveryQuery(chart)).toEqual({
            kind: 'savedChart',
            label: 'Linked revenue',
            chartUuid: 'chart-1',
            limit: 1000,
            parameters: { region: 'EMEA' },
            filters: undefined,
        });
    });

    it('prefers an explicit name over a linked chart label', () => {
        expect(
            toDeliveryQuery(savedChart('chart-1', 'From chart'), 'From argument')
                ?.label,
        ).toBe('From argument');
    });

    it('falls back to a null label when the linked chart has none', () => {
        expect(toDeliveryQuery(savedChart('chart-1'))?.label).toBeNull();
    });

    it('skips an unrecognised query shape with a warning rather than throwing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(
            toDeliveryQuery({ notAQuery: true } as unknown as QueryBuilder),
        ).toBeNull();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('useDelivery (inert)', () => {
    it('is a no-op that does not throw for a plain query', () => {
        expect(() => useDelivery(query('orders'))).not.toThrow();
    });

    it('is a no-op that does not throw for a linked saved chart', () => {
        expect(() =>
            useDelivery(savedChart('chart-1'), { name: 'Revenue' }),
        ).not.toThrow();
    });

    it('posts no message to the parent window', () => {
        const postMessage = vi.spyOn(window.parent, 'postMessage');
        useDelivery(query('orders'), { name: 'Revenue' });
        expect(postMessage).not.toHaveBeenCalled();
        postMessage.mockRestore();
    });
});
