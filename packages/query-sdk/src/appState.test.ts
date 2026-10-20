import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppStateError,
    createAppStateStore,
    matchesDefaultShape,
} from './appState';
import type {
    AppStateSharedEntry,
    AppStateSnapshot,
    AppStateTransport,
} from './types';

const sharedEntry = (
    value: unknown,
    version: number,
): AppStateSharedEntry => ({
    value,
    version,
    updatedAt: `2026-10-20T00:00:0${version}.000Z`,
    updatedBy: { userUuid: 'u-1', name: 'Alice' },
});

function mockTransport(
    snapshot: AppStateSnapshot = { user: {}, shared: {} },
): AppStateTransport & {
    setUser: ReturnType<typeof vi.fn>;
    setShared: ReturnType<typeof vi.fn>;
    getSnapshot: ReturnType<typeof vi.fn>;
} {
    let version = Math.max(
        0,
        ...Object.values(snapshot.shared).map((e) => e.version),
    );
    return {
        getSnapshot: vi.fn(async () => snapshot),
        setUser: vi.fn(async (_key: string, value: unknown) => ({
            value,
            updatedAt: '2026-10-20T01:00:00.000Z',
        })),
        deleteUser: vi.fn(async () => undefined),
        setShared: vi.fn(async (_key: string, value: unknown) => {
            version += 1;
            return sharedEntry(value, version);
        }),
        deleteShared: vi.fn(async () => undefined),
        getSharedHistory: vi.fn(async () => []),
    };
}

// Fake timers are on; drain promise chains without touching the clock.
const flushMicrotasks = async () => {
    for (let i = 0; i < 25; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
};

describe('createAppStateStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads once and exposes the snapshot', async () => {
        const transport = mockTransport({
            user: { tab: { value: 'b', updatedAt: 't' } },
            shared: { targets: sharedEntry({ q1: 1 }, 2) },
        });
        const store = createAppStateStore({ transport, warn: vi.fn() });
        expect(store.getState().status).toBe('idle');
        await Promise.all([store.load(), store.load()]);
        expect(transport.getSnapshot).toHaveBeenCalledTimes(1);
        expect(store.getState().status).toBe('ready');
        expect(store.getUserValue('tab')).toBe('b');
        expect(store.getState().shared.targets.version).toBe(2);
    });

    it('coalesces per-user writes and keeps the local value while persisting', async () => {
        const transport = mockTransport();
        const store = createAppStateStore({
            transport,
            coalesceMs: 300,
            warn: vi.fn(),
        });
        await store.load();
        store.setUser('filters', { region: 'E' });
        store.setUser('filters', { region: 'EU' });
        expect(store.getUserValue('filters')).toEqual({ region: 'EU' });
        expect(transport.setUser).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300);
        expect(transport.setUser).toHaveBeenCalledTimes(1);
        expect(transport.setUser).toHaveBeenCalledWith('filters', {
            region: 'EU',
        });
        expect(store.getState().user.filters.updatedAt).toBe(
            '2026-10-20T01:00:00.000Z',
        );
    });

    it('writes shared values with the version it last read', async () => {
        const transport = mockTransport({
            user: {},
            shared: { targets: sharedEntry({ q1: 1 }, 4) },
        });
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setShared('targets', { q1: 2 }, {});
        await vi.advanceTimersByTimeAsync(300);
        expect(transport.setShared).toHaveBeenCalledWith(
            'targets',
            { q1: 2 },
            4,
        );
        expect(store.getState().shared.targets.version).toBe(5);
        store.setShared('brand-new', 'x', null);
        await vi.advanceTimersByTimeAsync(300);
        expect(transport.setShared).toHaveBeenLastCalledWith(
            'brand-new',
            'x',
            null,
        );
    });

    it('re-applies updaters on top of the server value after a conflict', async () => {
        const transport = mockTransport({
            user: {},
            shared: { comments: sharedEntry(['a'], 1) },
        });
        transport.setShared.mockImplementationOnce(async () => {
            throw new AppStateError(
                'conflict',
                'changed',
                sharedEntry(['a', 'b'], 2),
            );
        });
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setShared(
            'comments',
            (prev: unknown) => [...(prev as string[]), 'mine'],
            [],
        );
        expect(store.getState().shared.comments.value).toEqual(['a', 'mine']);
        await vi.advanceTimersByTimeAsync(300);
        await flushMicrotasks();
        expect(transport.setShared).toHaveBeenCalledTimes(2);
        expect(transport.setShared).toHaveBeenLastCalledWith(
            'comments',
            ['a', 'b', 'mine'],
            2,
        );
        expect(store.getState().shared.comments.value).toEqual([
            'a',
            'b',
            'mine',
        ]);
        expect(store.getState().keyErrors).toEqual({});
    });

    it('surfaces a conflict for a plain value and shows what the server has', async () => {
        const transport = mockTransport({
            user: {},
            shared: { targets: sharedEntry({ q1: 1 }, 1) },
        });
        transport.setShared.mockImplementationOnce(async () => {
            throw new AppStateError(
                'conflict',
                'changed',
                sharedEntry({ q1: 7 }, 2),
            );
        });
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setShared('targets', { q1: 2 }, {});
        await vi.advanceTimersByTimeAsync(300);
        await flushMicrotasks();
        expect(transport.setShared).toHaveBeenCalledTimes(1);
        expect(store.getState().shared.targets).toEqual(
            sharedEntry({ q1: 7 }, 2),
        );
        expect(store.getState().keyErrors['shared:targets'].code).toBe(
            'conflict',
        );
    });

    it('keeps values in memory when the feature is off', async () => {
        const transport = mockTransport();
        transport.getSnapshot.mockRejectedValueOnce(
            new AppStateError('feature_disabled', 'off'),
        );
        const warn = vi.fn();
        const store = createAppStateStore({ transport, warn });
        await store.load();
        expect(store.getState().status).toBe('memory');
        expect(store.getState().error?.code).toBe('feature_disabled');
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not enabled/));
        store.setUser('tab', 'b');
        store.setShared('targets', 1, null);
        await vi.advanceTimersByTimeAsync(300);
        expect(store.getUserValue('tab')).toBe('b');
        expect(store.getState().shared.targets.value).toBe(1);
        expect(transport.setUser).not.toHaveBeenCalled();
        expect(transport.setShared).not.toHaveBeenCalled();
        expect(await store.history('targets')).toEqual([]);
    });

    it('keeps values in memory without a transport', async () => {
        const warn = vi.fn();
        const store = createAppStateStore({ transport: null, warn });
        await store.load();
        expect(store.getState().status).toBe('memory');
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(/VITE_LIGHTDASH_APP_UUID/),
        );
    });

    it('lets a URL-seeded key win until the app sets it', async () => {
        const transport = mockTransport({
            user: { period: { value: 'saved', updatedAt: 't' } },
            shared: {},
        });
        const store = createAppStateStore({
            transport,
            urlSeed: { period: 'from-link' },
            warn: vi.fn(),
        });
        await store.load();
        expect(store.getUserValue('period')).toBe('from-link');
        store.setUser('period', 'chosen');
        expect(store.getUserValue('period')).toBe('chosen');
    });

    it('flushes pending writes on demand and lets local writes win over a late snapshot', async () => {
        const transport = mockTransport({
            user: { tab: { value: 'server', updatedAt: 't' } },
            shared: {},
        });
        const store = createAppStateStore({ transport, warn: vi.fn() });
        store.setUser('tab', 'local');
        await store.flush();
        expect(store.getState().status).toBe('ready');
        expect(transport.setUser).toHaveBeenCalledWith('tab', 'local');
        expect(store.getUserValue('tab')).toBe('local');
    });

    it('records a per-key error on a failed write and keeps the local value', async () => {
        const transport = mockTransport();
        transport.setUser.mockRejectedValueOnce(
            new AppStateError('invalid', 'too big'),
        );
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setUser('big', 'x');
        await vi.advanceTimersByTimeAsync(300);
        await flushMicrotasks();
        expect(store.getState().keyErrors['user:big'].code).toBe('invalid');
        expect(store.getUserValue('big')).toBe('x');
        store.setUser('big', 'y');
        await vi.advanceTimersByTimeAsync(300);
        await flushMicrotasks();
        expect(store.getState().keyErrors).toEqual({});
    });
});

describe('createAppStateStore ordering and recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    type Deferred = { resolve: (v: unknown) => void; reject: (e: Error) => void };
    const deferredTransport = () => {
        const transport = mockTransport();
        const holds: Deferred[] = [];
        transport.setUser.mockImplementation(
            (_key: string, value: unknown) =>
                new Promise((resolve, reject) => {
                    holds.push({
                        resolve: () =>
                            resolve({ value, updatedAt: `t-${holds.length}` }),
                        reject,
                    });
                }),
        );
        return { transport, holds };
    };

    it('sends the first change at once and serializes later saves behind it', async () => {
        const { transport, holds } = deferredTransport();
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setUser('x', 'first');
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.setUser).toHaveBeenCalledTimes(1);
        store.setUser('x', 'second');
        await vi.advanceTimersByTimeAsync(300);
        // The second save waits for the first response.
        expect(transport.setUser).toHaveBeenCalledTimes(1);
        holds[0].resolve(undefined);
        await flushMicrotasks();
        expect(transport.setUser).toHaveBeenCalledTimes(2);
        expect(transport.setUser).toHaveBeenLastCalledWith('x', 'second');
        expect(store.getUserValue('x')).toBe('second');
        expect(store.isSaved('user', 'x')).toBe(false);
        holds[1].resolve(undefined);
        await flushMicrotasks();
        expect(store.getUserValue('x')).toBe('second');
        expect(store.isSaved('user', 'x')).toBe(true);
    });

    it('runs a delete after the save in flight for that key', async () => {
        const { transport, holds } = deferredTransport();
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setUser('x', 'resurrected?');
        await vi.advanceTimersByTimeAsync(0);
        const deletion = store.deleteUser('x');
        expect(store.getUserValue('x')).toBeUndefined();
        expect(transport.deleteUser).not.toHaveBeenCalled();
        holds[0].resolve(undefined);
        await deletion;
        expect(transport.deleteUser).toHaveBeenCalledWith('x');
        expect(store.getUserValue('x')).toBeUndefined();
    });

    it('does not let a late snapshot revive a key deleted while loading', async () => {
        const transport = mockTransport({
            user: { x: { value: 'old persisted', updatedAt: 't' } },
            shared: { s: sharedEntry(1, 1) },
        });
        let releaseSnapshot: () => void = () => {};
        const snapshot: AppStateSnapshot = {
            user: { x: { value: 'old persisted', updatedAt: 't' } },
            shared: { s: sharedEntry(1, 1) },
        };
        transport.getSnapshot.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseSnapshot = () => resolve(snapshot);
                }),
        );
        const store = createAppStateStore({ transport, warn: vi.fn() });
        const loading = store.load();
        const deletions = Promise.all([
            store.deleteUser('x'),
            store.deleteShared('s'),
        ]);
        releaseSnapshot();
        await loading;
        await deletions;
        expect(store.getState().status).toBe('ready');
        expect(store.getUserValue('x')).toBeUndefined();
        expect(store.getState().shared.s).toBeUndefined();
        expect(transport.deleteUser).toHaveBeenCalledWith('x');
        expect(transport.deleteShared).toHaveBeenCalledWith('s');
    });

    it('keeps a failed write pending, reports it, and retries on the next flush', async () => {
        const transport = mockTransport();
        transport.setUser.mockRejectedValueOnce(new Error('offline'));
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        store.setUser('x', 'draft');
        await vi.advanceTimersByTimeAsync(0);
        await flushMicrotasks();
        expect(store.getState().keyErrors['user:x'].code).toBe('unknown');
        expect(store.isSaved('user', 'x')).toBe(false);
        expect(store.getState().status).toBe('ready');
        await store.flush();
        expect(transport.setUser).toHaveBeenCalledTimes(2);
        expect(store.getState().keyErrors).toEqual({});
        expect(store.isSaved('user', 'x')).toBe(true);
    });

    it('recovers from a failed initial load on refresh', async () => {
        const transport = mockTransport({
            user: { x: { value: 'server', updatedAt: 't' } },
            shared: {},
        });
        transport.getSnapshot.mockRejectedValueOnce(
            new AppStateError('unavailable', 'down'),
        );
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        expect(store.getState().status).toBe('memory');
        store.setUser('y', 'typed while down');
        await store.refresh();
        expect(store.getState().status).toBe('ready');
        expect(store.getUserValue('x')).toBe('server');
        expect(store.getUserValue('y')).toBe('typed while down');
    });

    it('does not retry a load refused by the feature flag', async () => {
        const transport = mockTransport();
        transport.getSnapshot.mockRejectedValue(
            new AppStateError('feature_disabled', 'off'),
        );
        const store = createAppStateStore({ transport, warn: vi.fn() });
        await store.load();
        await store.refresh();
        expect(transport.getSnapshot).toHaveBeenCalledTimes(1);
    });

    it('publishes a restored value into URL state once loaded, unless the link already set it', async () => {
        const transport = mockTransport({
            user: {
                period: { value: 'saved', updatedAt: 't' },
                tab: { value: 'saved-tab', updatedAt: 't' },
            },
            shared: {},
        });
        const publishUrl = vi.fn();
        const store = createAppStateStore({
            transport,
            urlSeed: { tab: 'from-link' },
            publishUrl,
            warn: vi.fn(),
        });
        store.mirrorToUrl('period');
        store.mirrorToUrl('tab');
        expect(publishUrl).not.toHaveBeenCalled();
        await store.load();
        expect(publishUrl).toHaveBeenCalledTimes(1);
        expect(publishUrl).toHaveBeenCalledWith('period', 'saved');
        store.mirrorToUrl('period');
        expect(publishUrl).toHaveBeenCalledTimes(1);
    });
});

describe('matchesDefaultShape', () => {
    it('accepts same-kind values and anything for a null default', () => {
        expect(matchesDefaultShape(['a'], [])).toBe(true);
        expect(matchesDefaultShape({ a: 1 }, {})).toBe(true);
        expect(matchesDefaultShape(3, 0)).toBe(true);
        expect(matchesDefaultShape('x', null)).toBe(true);
    });

    it('rejects a value of another kind', () => {
        expect(matchesDefaultShape({ a: 1 }, [])).toBe(false);
        expect(matchesDefaultShape('3', 0)).toBe(false);
        expect(matchesDefaultShape(null, {})).toBe(false);
    });
});
