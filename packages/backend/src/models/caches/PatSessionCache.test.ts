import type { PersonalAccessToken, SessionUser } from '@lightdash/common';
import NodeCache from 'node-cache';
import type { CachedPatSessionUser } from './PatSessionCache';

type PatSessionCacheModule = typeof import('./PatSessionCache');

const fixture: CachedPatSessionUser = {
    user: { userUuid: 'user-1' } as SessionUser,
    personalAccessToken: { uuid: 'pat-1' } as PersonalAccessToken,
};

const otherFixture: CachedPatSessionUser = {
    user: { userUuid: 'user-2' } as SessionUser,
    personalAccessToken: { uuid: 'pat-2' } as PersonalAccessToken,
};

const loadCache = async (): Promise<PatSessionCacheModule> => {
    vi.resetModules();
    return import('./PatSessionCache');
};

describe('PatSessionCache', () => {
    const ENV_KEYS = ['EXPERIMENTAL_CACHE', 'LIGHTDASH_SECRET'] as const;
    let savedEnv: Partial<
        Record<(typeof ENV_KEYS)[number], string | undefined>
    >;

    beforeEach(() => {
        vi.useFakeTimers();
        savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        for (const key of ENV_KEYS) {
            const value = savedEnv[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    describe('when EXPERIMENTAL_CACHE is enabled', () => {
        beforeEach(() => {
            process.env.EXPERIMENTAL_CACHE = 'true';
            process.env.LIGHTDASH_SECRET = 'test-secret';
        });

        it('returns undefined for an unknown token', async () => {
            const { PatSessionCache } = await loadCache();
            expect(PatSessionCache.get('nope')).toBeUndefined();
        });

        it('round-trips a value via set/get', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
        });

        it('isolates entries across distinct tokens', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            PatSessionCache.set('token-b', otherFixture, Date.now());
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
            expect(PatSessionCache.get('token-b')).toEqual(otherFixture);
        });

        it('overwrites the value when set is called again with the same token', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            PatSessionCache.set('token-a', otherFixture, Date.now());
            expect(PatSessionCache.get('token-a')).toEqual(otherFixture);
        });

        it('invalidate clears every entry', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            PatSessionCache.set('token-b', otherFixture, Date.now());
            PatSessionCache.invalidate();
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            expect(PatSessionCache.get('token-b')).toBeUndefined();
        });

        it('does not return entries cached under a different LIGHTDASH_SECRET', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            process.env.LIGHTDASH_SECRET = 'rotated-secret';
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            process.env.LIGHTDASH_SECRET = 'test-secret';
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
        });

        it.each([
            { age: 0, lifetime: 30_000 },
            { age: 5_000, lifetime: 25_000 },
            { age: -5_000, lifetime: 30_000 },
        ])(
            'expires a lookup aged $age ms after $lifetime ms',
            async ({ age, lifetime }) => {
                const { PatSessionCache } = await loadCache();
                PatSessionCache.set('token-a', fixture, Date.now() - age);
                vi.advanceTimersByTime(lifetime - 100);
                expect(PatSessionCache.get('token-a')).toEqual(fixture);
                vi.advanceTimersByTime(200);
                expect(PatSessionCache.get('token-a')).toBeUndefined();
            },
        );

        it.each([0, 2_000, 6_000])(
            'checks the deadline after a %s ms pause inside node-cache.set',
            async (pauseMs) => {
                const originalSet = NodeCache.prototype.set;
                const set = vi
                    .spyOn(NodeCache.prototype, 'set')
                    .mockImplementation(function setAfterPause(
                        this: NodeCache,
                        ...args: Parameters<NodeCache['set']>
                    ) {
                        vi.advanceTimersByTime(pauseMs);
                        return originalSet.apply(this, args);
                    });
                const { PatSessionCache } = await loadCache();
                PatSessionCache.set('token-a', fixture, Date.now() - 29_000);
                const cache = set.mock.contexts[0] as NodeCache;
                const [key] = set.mock.calls[0];
                expect(cache.has(key)).toBe(true);
                expect(cache.get(key)).toBeDefined();
                expect(PatSessionCache.get('token-a')).toEqual(
                    pauseMs < 5_000 ? fixture : undefined,
                );
            },
        );

        it('uses the older lookup deadline when lookups finish in reverse order', async () => {
            const { PatSessionCache } = await loadCache();
            const startedAtA = Date.now();
            vi.advanceTimersByTime(10_000);
            const startedAtB = Date.now();
            vi.advanceTimersByTime(2_000);
            PatSessionCache.set('token-a', otherFixture, startedAtB);
            expect(PatSessionCache.get('token-a')).toEqual(otherFixture);
            vi.advanceTimersByTime(8_000);
            PatSessionCache.set('token-a', fixture, startedAtA);
            vi.advanceTimersByTime(9_900);
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
            vi.advanceTimersByTime(200);
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });

        it('renews the entry when a second slow lookup finishes, and a hit does not renew it', async () => {
            const { PatSessionCache } = await loadCache();
            const startedAt = Date.now();
            vi.advanceTimersByTime(45_000);
            PatSessionCache.set('token-a', fixture, startedAt);
            vi.advanceTimersByTime(4_000);
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
            PatSessionCache.set('token-a', otherFixture, startedAt);
            vi.advanceTimersByTime(1_100);
            expect(PatSessionCache.get('token-a')).toEqual(otherFixture);
            vi.advanceTimersByTime(3_800);
            expect(PatSessionCache.get('token-a')).toEqual(otherFixture);
            vi.advanceTimersByTime(200);
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });

        it('removes entries from node-cache after its default write lifetime', async () => {
            const set = vi.spyOn(NodeCache.prototype, 'set');
            const { PatSessionCache } = await loadCache();
            const writtenAt = Date.now();
            PatSessionCache.set('token-a', fixture, writtenAt - 29_999);
            const cache = set.mock.contexts[0] as NodeCache;
            const [key] = set.mock.calls[0];
            expect(cache.has(key)).toBe(true);
            vi.advanceTimersByTime(120_000);
            expect(cache.keys()).not.toContain(key);
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            expect(cache.has(key)).toBe(false);
            expect(set).toHaveBeenCalledExactlyOnceWith(key, {
                value: fixture,
                expiresAt: writtenAt + 5_000,
            });
            expect(cache.options.stdTTL).toBe(30);
        });

        it.each([30_000, 45_000, 600_000])(
            'caches a lookup aged %s ms for five seconds after the write',
            async (age) => {
                const set = vi.spyOn(NodeCache.prototype, 'set');
                const { PatSessionCache } = await loadCache();
                PatSessionCache.set('token-a', fixture, Date.now() - age);
                expect(set).toHaveBeenCalledTimes(1);
                vi.advanceTimersByTime(4_900);
                expect(PatSessionCache.get('token-a')).toEqual(fixture);
                vi.advanceTimersByTime(200);
                expect(PatSessionCache.get('token-a')).toBeUndefined();
            },
        );
    });

    describe('when EXPERIMENTAL_CACHE is disabled', () => {
        beforeEach(() => {
            delete process.env.EXPERIMENTAL_CACHE;
            process.env.LIGHTDASH_SECRET = 'test-secret';
        });

        it('set is a no-op', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });

        it('get returns undefined', async () => {
            const { PatSessionCache } = await loadCache();
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });

        it('invalidate does not throw', async () => {
            const { PatSessionCache } = await loadCache();
            expect(() => PatSessionCache.invalidate()).not.toThrow();
        });

        it('only treats the literal string "true" as enabled', async () => {
            process.env.EXPERIMENTAL_CACHE = 'TRUE';
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture, Date.now());
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });
    });
});
