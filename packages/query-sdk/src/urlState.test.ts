import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createUrlStateStore,
    MAX_URL_STATE_CHARS,
    parseUrlStateSeed,
    serializeUrlState,
} from './urlState';

describe('parseUrlStateSeed', () => {
    const encoded = encodeURIComponent(
        JSON.stringify({ period: 'last_month' }),
    );

    it('reads the seed from the iframe hash', () => {
        expect(
            parseUrlStateSeed({
                hash: `#transport=postMessage&projectUuid=abc&state=${encoded}`,
                search: '',
            }),
        ).toEqual({ period: 'last_month' });
    });

    it('falls back to the search param when the hash has no state (local dev)', () => {
        expect(
            parseUrlStateSeed({ hash: '', search: `?state=${encoded}` }),
        ).toEqual({ period: 'last_month' });
    });

    it('prefers the hash over the search param', () => {
        const other = encodeURIComponent(JSON.stringify({ period: 'ytd' }));
        expect(
            parseUrlStateSeed({
                hash: `#state=${encoded}`,
                search: `?state=${other}`,
            }),
        ).toEqual({ period: 'last_month' });
    });

    it('returns an empty map for an oversized raw value', () => {
        const big = encodeURIComponent(
            JSON.stringify({ big: 'x'.repeat(MAX_URL_STATE_CHARS) }),
        );
        expect(
            parseUrlStateSeed({ hash: `#state=${big}`, search: '' }),
        ).toEqual({});
    });

    it('returns an empty map for absent, malformed, or non-object state', () => {
        expect(parseUrlStateSeed({ hash: '', search: '' })).toEqual({});
        expect(
            parseUrlStateSeed({ hash: '#state=not-json', search: '' }),
        ).toEqual({});
        expect(parseUrlStateSeed({ hash: '#state=42', search: '' })).toEqual(
            {},
        );
        expect(
            parseUrlStateSeed({ hash: '#state=%5B1%2C2%5D', search: '' }),
        ).toEqual({});
    });
});

describe('serializeUrlState', () => {
    it('serializes a plain map', () => {
        expect(serializeUrlState({ a: 1 })).toBe('{"a":1}');
    });

    it('returns null when over the size cap', () => {
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        expect(
            serializeUrlState({ big: 'x'.repeat(MAX_URL_STATE_CHARS) }),
        ).toBeNull();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('returns null for non-JSON-serializable state', () => {
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(serializeUrlState(circular)).toBeNull();
        warn.mockRestore();
    });
});

describe('createUrlStateStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts from the seed and updates immutably on setKey', () => {
        const store = createUrlStateStore({
            seed: { period: 'ytd' },
            publish: () => undefined,
        });
        const before = store.getState();
        store.setKey('tab', 'overview');
        expect(store.getState()).toEqual({ period: 'ytd', tab: 'overview' });
        expect(before).toEqual({ period: 'ytd' });
    });

    it('notifies subscribers on change and stops after unsubscribe', () => {
        const store = createUrlStateStore({
            seed: {},
            publish: () => undefined,
        });
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.setKey('a', 1);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.setKey('a', 2);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('skips notify and publish when the value is unchanged', () => {
        const publish = vi.fn();
        const store = createUrlStateStore({
            seed: { a: 1 },
            publish,
            debounceMs: 10,
        });
        const listener = vi.fn();
        store.subscribe(listener);
        store.setKey('a', 1);
        vi.advanceTimersByTime(50);
        expect(listener).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('debounces publish to a single trailing call with the latest state', () => {
        const publish = vi.fn();
        const store = createUrlStateStore({
            seed: {},
            publish,
            debounceMs: 10,
        });
        store.setKey('period', 'last_month');
        store.setKey('period', 'ytd');
        store.setKey('tab', 'detail');
        expect(publish).not.toHaveBeenCalled();
        vi.advanceTimersByTime(10);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith({ period: 'ytd', tab: 'detail' });
    });
});
