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

const loadCache = (): PatSessionCacheModule => {
    let mod: PatSessionCacheModule | undefined;
    jest.isolateModules(() => {
        // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
        mod = require('./PatSessionCache');
    });
    if (!mod) throw new Error('PatSessionCache module failed to load');
    return mod;
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

        it('returns undefined for an unknown token', () => {
            const { PatSessionCache } = loadCache();
            expect(PatSessionCache.get('nope')).toBeUndefined();
        });

        it('round-trips a value via set/get', () => {
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
        });

        it('isolates entries across distinct tokens', () => {
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            PatSessionCache.set('token-b', otherFixture);
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
            expect(PatSessionCache.get('token-b')).toEqual(otherFixture);
        });

        it('overwrites the value when set is called again with the same token', () => {
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            PatSessionCache.set('token-a', otherFixture);
            expect(PatSessionCache.get('token-a')).toEqual(otherFixture);
        });

        it('invalidate clears every entry', () => {
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            PatSessionCache.set('token-b', otherFixture);
            PatSessionCache.invalidate();
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            expect(PatSessionCache.get('token-b')).toBeUndefined();
        });

        it('does not return entries cached under a different LIGHTDASH_SECRET', () => {
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            process.env.LIGHTDASH_SECRET = 'rotated-secret';
            expect(PatSessionCache.get('token-a')).toBeUndefined();
            process.env.LIGHTDASH_SECRET = 'test-secret';
            expect(PatSessionCache.get('token-a')).toEqual(fixture);
        });

        it('expires entries after the 30s TTL', () => {
            jest.useFakeTimers();
            try {
                const { PatSessionCache } = loadCache();
                PatSessionCache.set('token-a', fixture);
                jest.advanceTimersByTime(29_000);
                expect(PatSessionCache.get('token-a')).toEqual(fixture);
                jest.advanceTimersByTime(2_000);
                expect(PatSessionCache.get('token-a')).toBeUndefined();
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('when EXPERIMENTAL_CACHE is disabled', () => {
        beforeEach(() => {
            delete process.env.EXPERIMENTAL_CACHE;
            process.env.LIGHTDASH_SECRET = 'test-secret';
        });

        it('set is a no-op', () => {
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });

        it('get returns undefined', () => {
            const { PatSessionCache } = loadCache();
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });

        it('invalidate does not throw', () => {
            const { PatSessionCache } = loadCache();
            expect(() => PatSessionCache.invalidate()).not.toThrow();
        });

        it('only treats the literal string "true" as enabled', () => {
            process.env.EXPERIMENTAL_CACHE = 'TRUE';
            const { PatSessionCache } = loadCache();
            PatSessionCache.set('token-a', fixture);
            expect(PatSessionCache.get('token-a')).toBeUndefined();
        });
    });
});
