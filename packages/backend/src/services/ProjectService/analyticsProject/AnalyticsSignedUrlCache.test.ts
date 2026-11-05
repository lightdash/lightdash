import { AnalyticsSignedUrlCache } from './AnalyticsSignedUrlCache';

describe('AnalyticsSignedUrlCache', () => {
    let now: number;
    const createCache = (overrides = {}) =>
        new AnalyticsSignedUrlCache({
            maxEntries: 8,
            maxBytes: 1024,
            concurrency: 2,
            now: () => now,
            ...overrides,
        });
    const deferred = () => {
        let resolve!: (url: string) => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<string>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        return { promise, resolve, reject };
    };

    beforeEach(() => {
        now = 0;
    });

    it('shares pending signatures and reuses them only for the same identity', async () => {
        const cache = createCache();
        const signing = deferred();
        const sign = vi.fn(() => signing.promise);
        const request = { identity: 'org-a/file/v1/credentials-a', expiresAt: 1000, sign };
        const requests = Array.from({ length: 8 }, () => cache.get(request));
        signing.resolve('signed-url');
        const results = await Promise.all(requests);
        expect(sign).toHaveBeenCalledTimes(1);
        expect(results[0]).toEqual({ url: 'signed-url', cacheHit: false });
        expect(results.slice(1)).toEqual(
            Array(7).fill({ url: 'signed-url', cacheHit: true }),
        );
        await cache.get({ ...request, identity: 'org-b/file/v1/credentials-a' });
        await cache.get({ ...request, identity: 'org-a/file/v2/credentials-a' });
        await cache.get({ ...request, identity: 'org-a/file/v1/credentials-b' });
        expect(sign).toHaveBeenCalledTimes(4);
    });

    it('refreshes at the safe reuse deadline rather than the URL expiry', async () => {
        const cache = createCache();
        const sign = vi.fn(async () => `url-${now}`);
        await cache.get({ identity: 'file', expiresAt: 1000, sign });
        now = 999;
        expect(await cache.get({ identity: 'file', expiresAt: 1999, sign })).toEqual({
            url: 'url-0', cacheHit: true,
        });
        now = 1000;
        expect(await cache.get({ identity: 'file', expiresAt: 2000, sign })).toEqual({
            url: 'url-1000', cacheHit: false,
        });
        expect(sign).toHaveBeenCalledTimes(2);
    });

    it('does not reuse a signature whose deadline passed while signing', async () => {
        const cache = createCache();
        const signing = deferred();
        const first = cache.get({ identity: 'file', expiresAt: 10, sign: () => signing.promise });
        const refresh = vi.fn(async () => 'fresh');
        const next = cache.get({ identity: 'file', expiresAt: 1000, sign: refresh });
        now = 10;
        signing.resolve('original');
        expect(await first).toEqual({ url: 'original', cacheHit: false });
        expect(await next).toEqual({ url: 'fresh', cacheHit: false });
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('removes failures, releases signing capacity and permits a fresh retry', async () => {
        const cache = createCache({ concurrency: 1 });
        const signing = deferred();
        const sign = vi.fn(() => signing.promise);
        const first = cache.get({ identity: 'file', expiresAt: 1000, sign });
        const duplicate = cache.get({ identity: 'file', expiresAt: 1000, sign });
        const queued = cache.get({ identity: 'other', expiresAt: 1000, sign: async () => 'other-url' });
        const results = Promise.allSettled([first, duplicate, queued]);
        signing.reject(new Error('temporary signing failure'));
        expect((await results).map((result) => result.status)).toEqual([
            'rejected', 'rejected', 'fulfilled',
        ]);
        expect(sign).toHaveBeenCalledTimes(1);
        expect(await cache.get({ identity: 'file', expiresAt: 1000, sign: async () => 'retry-url' })).toEqual({
            url: 'retry-url', cacheHit: false,
        });
    });

    it('bounds concurrent unique signing and queues complete results', async () => {
        const cache = createCache({ maxEntries: 3 });
        const signing = [deferred(), deferred(), deferred()];
        const sign = signing.map((pending) => vi.fn(() => pending.promise));
        const requests = sign.map((fn, index) => cache.get({ identity: `${index}`, expiresAt: 1000, sign: fn }));
        await Promise.resolve();
        expect(sign.map((fn) => fn.mock.calls.length)).toEqual([1, 1, 0]);
        const excess = vi.fn(async () => 'excess');
        await expect(cache.get({ identity: 'excess', expiresAt: 1000, sign: excess })).rejects.toThrow('capacity exceeded');
        expect(excess).not.toHaveBeenCalled();
        signing[0].resolve('first');
        await requests[0];
        expect(sign.map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
        signing[1].resolve('second');
        signing[2].resolve('third');
        expect((await Promise.all(requests)).map(({ url }) => url)).toEqual(['first', 'second', 'third']);
    });

    it('evicts the least recently used resolved URL at the entry limit', async () => {
        const cache = createCache({ maxEntries: 2 });
        const sign = vi.fn(async () => 'url');
        for (const identity of ['a', 'b', 'a', 'c', 'b']) {
            // eslint-disable-next-line no-await-in-loop
            await cache.get({ identity, expiresAt: 1000, sign });
        }
        expect(sign).toHaveBeenCalledTimes(4);
    });

    it('bounds URL bytes and does not retain oversized results', async () => {
        const cache = createCache({ maxBytes: 6 });
        const sign = vi.fn(async () => 'four');
        for (const identity of ['a', 'b', 'a']) {
            // eslint-disable-next-line no-await-in-loop
            await cache.get({ identity, expiresAt: 1000, sign });
        }
        expect(sign).toHaveBeenCalledTimes(3);
        const large = vi.fn(async () => 'oversized-url');
        await cache.get({ identity: 'large', expiresAt: 1000, sign: large });
        await cache.get({ identity: 'large', expiresAt: 1000, sign: large });
        expect(large).toHaveBeenCalledTimes(2);
        expect(await cache.get({ identity: 'a', expiresAt: 1000, sign })).toEqual({ url: 'four', cacheHit: true });
    });

    it('clears settled entries without discarding pending signing reservations', async () => {
        const cache = createCache();
        const signing = deferred();
        const request = cache.get({ identity: 'file', expiresAt: 1000, sign: () => signing.promise });
        expect(() => cache.clear()).toThrow('while signing');
        signing.resolve('url');
        await request;
        cache.clear();
        expect(await cache.get({ identity: 'file', expiresAt: 1000, sign: async () => 'fresh' })).toEqual({ url: 'fresh', cacheHit: false });
    });
});
