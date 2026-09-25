import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashRawApi } from './apiClient';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('node-fetch', () => ({
    default: fetchMock,
}));

vi.mock('../../config', () => ({
    getConfig: vi.fn(async () => ({
        context: { apiKey: 'ldpat_test', serverUrl: 'http://localhost:9' },
    })),
}));

/** A fetch that never answers unless the caller aborts it. */
const hangingFetch = () =>
    fetchMock.mockImplementation(
        (_url: string, init: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => {
                    const error = new Error('The user aborted a request.');
                    error.name = 'AbortError';
                    reject(error);
                });
            }),
    );

describe('lightdashRawApi request timeout', () => {
    const previous = process.env.LIGHTDASH_API_TIMEOUT_MS;

    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (previous === undefined) delete process.env.LIGHTDASH_API_TIMEOUT_MS;
        else process.env.LIGHTDASH_API_TIMEOUT_MS = previous;
    });

    it('aborts a request that exceeds LIGHTDASH_API_TIMEOUT_MS with a clear error', async () => {
        process.env.LIGHTDASH_API_TIMEOUT_MS = '250';
        hangingFetch();
        const request = lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        });
        const outcome = request.then(
            () => 'resolved',
            (error: Error) => error.message,
        );
        await vi.advanceTimersByTimeAsync(300);
        await expect(outcome).resolves.toBe(
            'Request to http://localhost:9/api/v1/user timed out after 250ms',
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it('does not abort when the variable is unset or invalid', async () => {
        delete process.env.LIGHTDASH_API_TIMEOUT_MS;
        hangingFetch();
        let settled = false;
        void lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        }).then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );
        await vi.advanceTimersByTimeAsync(600_000);
        expect(settled).toBe(false);
        expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();

        process.env.LIGHTDASH_API_TIMEOUT_MS = 'soon';
        void lightdashRawApi({
            method: 'GET',
            url: '/api/v1/user',
            body: undefined,
        }).then(
            () => {},
            () => {},
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock.mock.calls[1][1].signal).toBeUndefined();
    });
});
