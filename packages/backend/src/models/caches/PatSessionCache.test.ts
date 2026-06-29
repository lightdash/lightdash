import type { PersonalAccessToken, SessionUser } from '@lightdash/common';
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
        savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    });

    afterEach(() => {
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
            PatSessionCache.set('token-a', fixture);
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
        });

        it('isolates entries across distinct tokens', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture);
            PatSessionCache.set('token-b', otherFixture);
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
            expect(PatSessionCache.get('token-b')).toEqual(otherFixture);
        });

        it('overwrites the value when set is called again with the same token', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture);
            PatSessionCache.set('token-a', otherFixture);
            expect(PatSessionCache.get('token-a')).toEqual(otherFixture);
        });

        it('invalidate clears every entry', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture);
            PatSessionCache.set('token-b', otherFixture);
            PatSessionCache.invalidate();
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            expect(PatSessionCache.get('token-b')).toBeUndefined();
        });

        it('does not return entries cached under a different LIGHTDASH_SECRET', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture);
            process.env.LIGHTDASH_SECRET = 'rotated-secret';
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            process.env.LIGHTDASH_SECRET = 'test-secret';
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
        });

        it('expires entries after the 30s TTL', async () => {
            vi.useFakeTimers();
            try {
                const { PatSessionCache } = await loadCache();
                PatSessionCache.set('token-a', fixture);
                vi.advanceTimersByTime(29_000);
                expect(PatSessionCache.get('token-a')).toEqual(fixture);
                vi.advanceTimersByTime(2_000);
                expect(PatSessionCache.get('token-a')).toBeUndefined();
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('when EXPERIMENTAL_CACHE is disabled', () => {
        beforeEach(() => {
            delete process.env.EXPERIMENTAL_CACHE;
            process.env.LIGHTDASH_SECRET = 'test-secret';
        });

        it('set is a no-op', async () => {
            const { PatSessionCache } = await loadCache();
            PatSessionCache.set('token-a', fixture);
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
            PatSessionCache.set('token-a', fixture);
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });
    });
});
