import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getDeliveryQueries,
    nextDeliveryId,
    publishDeliveryQueries,
    registerDeliveryQuery,
    resetDeliveryRegistry,
    toDeliveryQuery,
    unregisterDeliveryQuery,
    type DeliveryQuery,
} from './delivery';
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

const declaration = (label: string): DeliveryQuery => ({
    kind: 'query',
    label,
    query: query('orders').build(),
});

/** Let the coalesced publish flush. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('delivery registry', () => {
    beforeEach(() => resetDeliveryRegistry());
    afterEach(() => resetDeliveryRegistry());

    it('returns registered declarations in registration order', () => {
        registerDeliveryQuery('a', declaration('A'));
        registerDeliveryQuery('b', declaration('B'));
        expect(getDeliveryQueries().map((d) => d.label)).toEqual(['A', 'B']);
    });

    it('replaces a declaration re-registered under the same id', () => {
        registerDeliveryQuery('a', declaration('First'));
        registerDeliveryQuery('a', declaration('Second'));
        expect(getDeliveryQueries().map((d) => d.label)).toEqual(['Second']);
    });

    it('drops a declaration on unregister', () => {
        registerDeliveryQuery('a', declaration('A'));
        unregisterDeliveryQuery('a');
        expect(getDeliveryQueries()).toEqual([]);
    });

    it('publishes the declarations to the host', async () => {
        const target = { postMessage: vi.fn() } as unknown as Window;
        registerDeliveryQuery('a', declaration('A'));
        publishDeliveryQueries(target);
        await flush();
        expect(target.postMessage).toHaveBeenCalledWith(
            {
                type: 'lightdash:delivery:available',
                queries: [declaration('A')],
            },
            expect.any(String),
        );
    });

    it('does not publish when nothing is registered', async () => {
        const target = { postMessage: vi.fn() } as unknown as Window;
        publishDeliveryQueries(target);
        await flush();
        expect(target.postMessage).not.toHaveBeenCalled();
    });

    it('coalesces same-tick publishes into a single message', async () => {
        const target = { postMessage: vi.fn() } as unknown as Window;
        registerDeliveryQuery('a', declaration('A'));
        publishDeliveryQueries(target);
        registerDeliveryQuery('b', declaration('B'));
        publishDeliveryQueries(target);
        await flush();
        expect(target.postMessage).toHaveBeenCalledTimes(1);
        expect(target.postMessage).toHaveBeenCalledWith(
            {
                type: 'lightdash:delivery:available',
                queries: [declaration('A'), declaration('B')],
            },
            expect.any(String),
        );
    });

    it('reads the registry at flush time, not at schedule time', async () => {
        const target = { postMessage: vi.fn() } as unknown as Window;
        registerDeliveryQuery('a', declaration('A'));
        publishDeliveryQueries(target);
        unregisterDeliveryQuery('a');
        await flush();
        expect(target.postMessage).not.toHaveBeenCalled();
    });
});

describe('nextDeliveryId', () => {
    it('produces a distinct id per call', () => {
        expect(nextDeliveryId()).not.toBe(nextDeliveryId());
    });
});
