import {
    CACHE_TTL_SECONDS,
    createCacheEntry,
    readCacheEntry,
} from './cacheAge';

describe('cacheAge', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses a 30 second lifetime', () => {
        expect(CACHE_TTL_SECONDS).toBe(30);
    });

    describe('createCacheEntry', () => {
        it.each([
            { age: 0, lifetime: 30_000 },
            { age: 5_000, lifetime: 25_000 },
            { age: 29_999, lifetime: 1 },
            { age: -5_000, lifetime: 30_000 },
        ])(
            'gives a lookup aged $age ms a $lifetime ms lifetime',
            ({ age, lifetime }) => {
                const now = Date.now();
                expect(createCacheEntry('value', now - age)).toEqual({
                    value: 'value',
                    expiresAt: now + lifetime,
                });
            },
        );

        it.each([30_000, 31_000])('rejects a lookup aged %s ms', (age) => {
            expect(createCacheEntry('value', Date.now() - age)).toBeNull();
        });

        it.each([NaN, -Infinity])('rejects a start time of %s', (startedAt) => {
            expect(createCacheEntry('value', startedAt)).toBeNull();
        });

        it('clamps positive infinity to the current time', () => {
            expect(createCacheEntry('value', Infinity)).toEqual({
                value: 'value',
                expiresAt: Date.now() + 30_000,
            });
        });
    });

    describe('readCacheEntry', () => {
        it('returns undefined for a missing entry', () => {
            expect(readCacheEntry(undefined)).toBeUndefined();
        });

        it.each([
            { remaining: 1, expected: 'value' },
            { remaining: 0, expected: undefined },
            { remaining: -1, expected: undefined },
        ])(
            'reads an entry with $remaining ms remaining',
            ({ remaining, expected }) => {
                expect(
                    readCacheEntry({
                        value: 'value',
                        expiresAt: Date.now() + remaining,
                    }),
                ).toBe(expected);
            },
        );
    });
});
