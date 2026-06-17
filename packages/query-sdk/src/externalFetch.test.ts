import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import type { ExternalFetchResult } from './types';

describe('externalFetch types', () => {
    it('apiTransport exposes externalFetch on the Transport', () => {
        const adapter: FetchAdapter = vi.fn();
        const transport = createApiTransport(
            { apiKey: 'k', baseUrl: 'http://x', projectUuid: 'p' },
            adapter,
        );
        expect(typeof transport.externalFetch).toBe('function');
    });

    it('ExternalFetchResult has the M2-mirrored shape', () => {
        const r: ExternalFetchResult = {
            status: 200,
            contentType: 'application/json',
            body: { ok: true },
            truncated: false,
        };
        expect(r.status).toBe(200);
    });
});

describe('apiTransport.externalFetch', () => {
    it('throws — external fetch is only available inside a data app preview', async () => {
        const adapter = vi.fn();
        const transport = createApiTransport(
            { apiKey: 'k', baseUrl: 'http://x', projectUuid: 'proj-1' },
            adapter as unknown as FetchAdapter,
        );
        await expect(
            transport.externalFetch('stripe', {
                method: 'POST',
                path: '/v1/charges',
            }),
        ).rejects.toThrow(/only available inside a data app preview/i);
        // It must NOT attempt any network call from the dev/PAT path.
        expect(adapter).not.toHaveBeenCalled();
    });
});
