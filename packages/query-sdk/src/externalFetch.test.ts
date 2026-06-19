import { describe, expect, it, vi } from 'vitest';
import { createApiTransport, type FetchAdapter } from './apiTransport';
import { LightdashClient } from './client';
import {
    createPostMessageTransport,
    type SdkExternalFetchRequest,
} from './postMessageTransport';
import type { ExternalFetchResult, Transport } from './types';

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
    // The transport accepts responses only from `targetWindow` (window.parent),
    // so the simulated parent must stamp itself as the message source.
    const post = (msg: unknown) =>
        window.dispatchEvent(
            new MessageEvent('message', { data: msg, source: window.parent }),
        );
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

describe('LightdashClient.externalFetch', () => {
    it('delegates to the transport', async () => {
        const result = {
            status: 200,
            contentType: 'application/json',
            body: 1,
            truncated: false,
        };
        const transport: Transport = {
            executeQuery: vi.fn(),
            getUser: vi.fn(),
            externalFetch: vi.fn().mockResolvedValue(result),
        };
        const client = new LightdashClient(
            { apiKey: 'k', baseUrl: 'http://x', projectUuid: 'p' },
            transport,
        );
        const out = await client.externalFetch('stripe', {
            path: '/v1/charges',
        });
        expect(out).toEqual(result);
        expect(transport.externalFetch).toHaveBeenCalledWith('stripe', {
            path: '/v1/charges',
        });
    });
});

describe('postMessageTransport.externalFetch', () => {
    it('posts an external-fetch request to the parent and resolves the matching response', async () => {
        let seen: SdkExternalFetchRequest | undefined;
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
            expect(typeof seen?.id).toBe('string');
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

    it('ignores an external-fetch-response from a source other than the parent', async () => {
        const original = window.parent;
        let capturedId: string | undefined;
        Object.defineProperty(window, 'parent', {
            configurable: true,
            value: {
                postMessage: (msg: SdkExternalFetchRequest) => {
                    if (msg?.type === 'lightdash:sdk:external-fetch') {
                        capturedId = msg.id;
                    }
                },
            },
        });
        const dispatch = (data: unknown, source: MessageEventSource | null) =>
            window.dispatchEvent(new MessageEvent('message', { data, source }));
        try {
            const transport = createPostMessageTransport({
                targetWindow: window.parent,
                projectUuid: 'proj-1',
            });
            dispatch({ type: 'lightdash:sdk:ready' }, window.parent);
            const promise = transport.externalFetch('stripe', { path: '/x' });
            // Let the request post so we can capture its id.
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            expect(capturedId).toBeDefined();
            // Spoofed response: correct id, WRONG source → must be ignored.
            dispatch(
                {
                    type: 'lightdash:sdk:external-fetch-response',
                    id: capturedId,
                    result: {
                        status: 999,
                        contentType: 'application/json',
                        body: { spoofed: true },
                        truncated: false,
                    },
                },
                { postMessage() {} } as unknown as MessageEventSource,
            );
            // Genuine response from the parent resolves the call.
            dispatch(
                {
                    type: 'lightdash:sdk:external-fetch-response',
                    id: capturedId,
                    result: {
                        status: 200,
                        contentType: 'application/json',
                        body: { real: true },
                        truncated: false,
                    },
                },
                window.parent,
            );
            const out = await promise;
            expect(out.status).toBe(200);
        } finally {
            Object.defineProperty(window, 'parent', {
                configurable: true,
                value: original,
            });
        }
    });
});
