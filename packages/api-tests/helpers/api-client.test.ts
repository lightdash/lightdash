import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, fetchWithConnectionRetry } from './api-client';

const gatewayReset =
    'upstream connect error or disconnect/reset before headers. reset reason: connection termination';

describe('preview gateway retry', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        fetchMock.mockReset();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('retries a GET once when the preview gateway resets upstream', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(gatewayReset, { status: 503 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const request = fetchWithConnectionRetry('https://preview.test/health');
        await vi.advanceTimersByTimeAsync(1000);

        expect((await request).status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(process.stderr.write).toHaveBeenCalledWith(
            'Retrying GET https://preview.test/health after preview gateway reset\n',
        );
    });

    it('does not retry a 503 from the application', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response('service unavailable', { status: 503 }),
        );

        expect(
            (await fetchWithConnectionRetry('https://preview.test/health'))
                .status,
        ).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry a POST even when the gateway resets upstream', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(gatewayReset, { status: 503 }),
        );
        const client = new ApiClient();

        await expect(
            client.post('/api/v1/projects', {}, { failOnStatusCode: false }),
        ).resolves.toMatchObject({ status: 503 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry a second gateway reset', async () => {
        fetchMock.mockResolvedValue(
            new Response(gatewayReset, { status: 503 }),
        );

        const request = fetchWithConnectionRetry('https://preview.test/health');
        await vi.advanceTimersByTimeAsync(1000);

        expect((await request).status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
