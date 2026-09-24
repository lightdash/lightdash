import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import waitForServerHealth from './health';

describe('server health poll', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        fetchMock.mockReset();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('waits for an asleep preview to become healthy', async () => {
        fetchMock
            .mockRejectedValueOnce(new Error('connection refused'))
            .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const health = waitForServerHealth(
            'https://preview.test/health',
            10_000,
        );
        await vi.advanceTimersByTimeAsync(6_000);

        await expect(health).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('stops at the deadline and asks for a whole workflow rerun', async () => {
        fetchMock.mockResolvedValue(
            new Response('unavailable', { status: 503 }),
        );

        const health = waitForServerHealth(
            'https://preview.test/health',
            5_000,
        );
        const failure = health.then(
            () => null,
            (error: unknown) => String(error),
        );
        await vi.advanceTimersByTimeAsync(5_000);

        await expect(failure).resolves.toContain(
            'Server health check failed after 5000ms at https://preview.test/health (HTTP 503). Rerun the whole workflow.',
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
