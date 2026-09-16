import { describe, expect, it, vi } from 'vitest';
import {
    OmnibarSearchTiming,
    timeOmnibarSearch,
    timeOmnibarSearchSync,
} from './omnibarSearchTiming';

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
};

describe('OmnibarSearchTiming', () => {
    it('returns an immutable partial snapshot while parallel work is incomplete', async () => {
        let now = 10;
        const pending = deferred<void>();
        const timing = new OmnibarSearchTiming({
            invocationId: 'invocation-id',
            spanId: 'span-id',
            now: () => now,
        });

        const operation = timing.time('savedCharts', () => pending.promise);
        now = 25;
        const snapshot = timing.snapshot('error');

        expect(snapshot).toMatchObject({
            invocationId: 'invocation-id',
            spanId: 'span-id',
            outcome: 'error',
            totalServiceMs: 15,
        });
        expect(snapshot.phaseDurationsMs.savedCharts).toBeNull();
        expect(snapshot.phaseStatuses.savedCharts).toBe('incomplete');
        expect(snapshot.phaseStatuses.spaces).toBe('skipped');

        now = 40;
        pending.resolve();
        await operation;

        expect(snapshot.phaseDurationsMs.savedCharts).toBeNull();
        expect(snapshot.phaseStatuses.savedCharts).toBe('incomplete');
    });

    it('marks failures without changing the thrown error', async () => {
        let now = 0;
        const failure = new Error('search failed');
        const timing = new OmnibarSearchTiming({
            now: () => now,
            spanId: null,
        });

        const operation = timing.time('contentGroup', async () => {
            now = 12;
            throw failure;
        });

        await expect(operation).rejects.toBe(failure);
        expect(timing.snapshot('error').phaseStatuses.contentGroup).toBe(
            'error',
        );
        expect(timing.snapshot('error').phaseDurationsMs.contentGroup).toBe(12);
    });

    it('preserves disabled async and synchronous operation semantics', async () => {
        const promise = Promise.resolve('result');
        const asyncOperation = vi.fn(() => promise);
        const syncOperation = vi.fn(() => undefined);

        const returned = timeOmnibarSearch(
            undefined,
            'searchModel',
            asyncOperation,
        );
        const syncResult = timeOmnibarSearchSync(
            undefined,
            'pages',
            syncOperation,
        );

        expect(returned).toBe(promise);
        await expect(returned).resolves.toBe('result');
        expect(syncResult).toBeUndefined();
        expect(asyncOperation).toHaveBeenCalledOnce();
        expect(syncOperation).toHaveBeenCalledOnce();
    });
});
