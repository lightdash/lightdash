import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createPostMessageTransport,
    createRequestId,
    type SdkFetchRequest,
} from './postMessageTransport';
import { query } from './query';

describe('createRequestId', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses crypto.randomUUID when available', () => {
        vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-crypto' });

        expect(createRequestId()).toBe('uuid-from-crypto');
    });

    // Apps served from a plain-http origin (self-hosted, headless capture) have
    // no secure context, so `crypto.randomUUID` is undefined there.
    it('falls back to a locally generated id when randomUUID is missing', () => {
        vi.stubGlobal('crypto', {});

        const first = createRequestId();
        const second = createRequestId();

        expect(first).toEqual(expect.any(String));
        expect(first.length).toBeGreaterThan(0);
        expect(second).not.toBe(first);
    });

    it('falls back when crypto itself is undefined', () => {
        vi.stubGlobal('crypto', undefined);

        expect(createRequestId()).toEqual(expect.any(String));
    });
});

describe('postMessage transport explore base-table lookup', () => {
    // Simulates the host bridge: `answerBaseTable` decides how the virtual
    // route is answered; query routes always succeed.
    const installParentHost = (
        answerBaseTable: (req: SdkFetchRequest) => {
            result?: unknown;
            error?: string;
        },
    ) => {
        const original = window.parent;
        const parent = {} as Window;
        const requests: SdkFetchRequest[] = [];
        const reply = (data: unknown) =>
            window.dispatchEvent(
                new MessageEvent('message', { data, source: parent }),
            );
        Object.assign(parent, {
            postMessage: (msg: { type?: string }) => {
                if (msg?.type !== 'lightdash:sdk:fetch') return;
                const req = msg as SdkFetchRequest;
                requests.push(req);
                let answer: { result?: unknown; error?: string };
                if (req.path.endsWith('/__sdk/explore-base-table')) {
                    answer = answerBaseTable(req);
                } else if (req.method === 'POST') {
                    answer = {
                        result: {
                            queryUuid: 'q-1',
                            metricQuery: {},
                            fields: {},
                        },
                    };
                } else {
                    answer = {
                        result: {
                            status: 'ready',
                            columns: {},
                            rows: [],
                            totalResults: 0,
                        },
                    };
                }
                queueMicrotask(() =>
                    reply({
                        type: 'lightdash:sdk:fetch-response',
                        id: req.id,
                        ...answer,
                    }),
                );
            },
        });
        Object.defineProperty(window, 'parent', {
            configurable: true,
            value: parent,
        });
        return {
            requests,
            reply,
            restore: () =>
                Object.defineProperty(window, 'parent', {
                    configurable: true,
                    value: original,
                }),
        };
    };

    const runRenamedExploreQuery = async (
        answerBaseTable: Parameters<typeof installParentHost>[0],
    ) => {
        const host = installParentHost(answerBaseTable);
        try {
            const transport = createPostMessageTransport({
                targetWindow: window.parent,
                projectUuid: 'proj-1',
            });
            host.reply({ type: 'lightdash:sdk:ready' });
            await transport.executeQuery(
                query('orders_with_custom_dims')
                    .dimensions(['status'])
                    .limit(3)
                    .build(),
            );
            const metricQuery = host.requests.find((r) =>
                r.path.endsWith('/query/metric-query'),
            );
            return {
                requests: host.requests,
                dimensions: (
                    metricQuery?.body as { query: { dimensions: string[] } }
                ).query.dimensions,
            };
        } finally {
            host.restore();
        }
    };

    it('asks the host through a normal fetch on the virtual route', async () => {
        const { requests, dimensions } = await runRenamedExploreQuery(() => ({
            result: { baseTable: 'orders' },
        }));

        expect(requests[0]).toMatchObject({
            type: 'lightdash:sdk:fetch',
            method: 'POST',
            path: '/__sdk/explore-base-table',
            body: { exploreName: 'orders_with_custom_dims' },
        });
        expect(dimensions).toEqual(['orders_status']);
    });

    it('falls back to the explore name when an older host blocks the route', async () => {
        const { dimensions } = await runRenamedExploreQuery((req) => ({
            error: `Blocked: ${req.method} ${req.path}`,
        }));

        expect(dimensions).toEqual(['orders_with_custom_dims_status']);
    });
});
