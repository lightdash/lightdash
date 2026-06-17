import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import {
    createPostMessageTransport,
    type SdkExternalFetchRequest,
} from './postMessageTransport';
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

// Drives the iframe→parent handshake: replies to the `ready` and
// `external-fetch` messages the transport posts to `window.parent`.
function installParentStub(
    respond: (
        req: SdkExternalFetchRequest,
    ) => ExternalFetchResult | { error: string },
) {
    const original = window.parent;
    const post = (msg: unknown) =>
        window.dispatchEvent(new MessageEvent('message', { data: msg }));
    Object.defineProperty(window, 'parent', {
        configurable: true,
        value: {
            postMessage: (msg: SdkExternalFetchRequest | unknown) => {
                const typed = msg as SdkExternalFetchRequest;
                if (typed?.type === 'lightdash:sdk:external-fetch') {
                    const out = respond(typed);
                    if ('error' in out) {
                        post({
                            type: 'lightdash:sdk:external-fetch-response',
                            id: typed.id,
                            error: out.error,
                        });
                    } else {
                        post({
                            type: 'lightdash:sdk:external-fetch-response',
                            id: typed.id,
                            result: out,
                        });
                    }
                }
            },
        },
    });
    // Dispatch the ready signal asynchronously so the transport has a chance
    // to register its message listener before the event fires.
    void Promise.resolve().then(() => post({ type: 'lightdash:sdk:ready' }));
    return () =>
        Object.defineProperty(window, 'parent', {
            configurable: true,
            value: original,
        });
}

describe('postMessageTransport.externalFetch', () => {
    it('posts an external-fetch request to the parent and resolves the matching response', async () => {
        let seen: SdkExternalFetchRequest | null = null;
        const restore = installParentStub((req) => {
            seen = req;
            return {
                status: 201,
                contentType: 'application/json',
                body: { id: 'ch_1' },
                truncated: false,
            };
        });
        try {
            const transport = createPostMessageTransport({
                targetWindow: window.parent,
                projectUuid: 'proj-1',
            });
            const out = await transport.externalFetch('stripe', {
                method: 'POST',
                path: '/v1/charges',
                query: { limit: '5' },
                body: { amount: 100 },
            });
            expect(out).toEqual({
                status: 201,
                contentType: 'application/json',
                body: { id: 'ch_1' },
                truncated: false,
            });
            expect(seen).toMatchObject({
                type: 'lightdash:sdk:external-fetch',
                alias: 'stripe',
                method: 'POST',
                path: '/v1/charges',
                query: { limit: '5' },
                body: { amount: 100 },
            });
            expect(typeof (seen as SdkExternalFetchRequest).id).toBe('string');
        } finally {
            restore();
        }
    });

    it('rejects with the error from the response', async () => {
        const restore = installParentStub(() => ({
            error: 'Connection alias not found',
        }));
        try {
            const transport = createPostMessageTransport({
                targetWindow: window.parent,
                projectUuid: 'proj-1',
            });
            await expect(
                transport.externalFetch('nope', { path: '/x' }),
            ).rejects.toThrow('Connection alias not found');
        } finally {
            restore();
        }
    });
});
