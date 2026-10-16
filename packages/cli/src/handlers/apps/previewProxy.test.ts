import { LightdashSignedDownloadHeader } from '@lightdash/common';
import * as http from 'http';
import {
    PREVIEW_PROXY_NONCE_HEADER,
    startPreviewProxy,
    type PreviewProxyHandle,
} from './previewProxy';

const PROJECT_UUID = 'proj-uuid-1';
const NONCE = 'test-nonce';
const API_KEY = 'ldpat_secret';
const AUTHORIZATION = `ApiKey ${API_KEY}`;

type SeenRequest = {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
};

type UpstreamReply = { status: number; body: unknown };

/** Records every request and replies 200 with a JSON echo unless overridden. */
const startFakeUpstream = (): Promise<{
    url: string;
    seen: SeenRequest[];
    setReply: (reply: (req: SeenRequest) => UpstreamReply) => void;
    close: () => Promise<void>;
}> => {
    const seen: SeenRequest[] = [];
    let replyFor: (req: SeenRequest) => UpstreamReply = () => ({
        status: 200,
        body: { status: 'ok' },
    });
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            const request: SeenRequest = {
                method: req.method ?? '',
                url: req.url ?? '',
                headers: req.headers,
                body: Buffer.concat(chunks).toString('utf-8'),
            };
            seen.push(request);
            const reply = replyFor(request);
            res.writeHead(reply.status, {
                'content-type': 'application/json',
                'set-cookie': 'upstream=1',
            });
            res.end(
                typeof reply.body === 'string'
                    ? reply.body
                    : JSON.stringify(reply.body),
            );
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as { port: number };
            resolve({
                url: `http://127.0.0.1:${port}`,
                seen,
                setReply: (reply) => {
                    replyFor = reply;
                },
                close: () =>
                    new Promise<void>((r) => {
                        server.close(() => r());
                        server.closeAllConnections();
                    }),
            });
        });
    });
};

describe('startPreviewProxy', () => {
    let upstream: Awaited<ReturnType<typeof startFakeUpstream>>;
    let proxy: PreviewProxyHandle;

    const proxyFetch = (
        path: string,
        init: RequestInit & {
            nonce?: string | null;
            authorization?: string | null;
        } = {},
    ) => {
        const {
            nonce = NONCE,
            authorization = `ApiKey ${NONCE}`,
            ...rest
        } = init;
        const headers = new Headers(rest.headers);
        if (nonce !== null) headers.set(PREVIEW_PROXY_NONCE_HEADER, nonce);
        if (authorization !== null) {
            headers.set('authorization', authorization);
        }
        return fetch(`http://127.0.0.1:${proxy.port}${path}`, {
            ...rest,
            headers,
        });
    };

    beforeEach(async () => {
        upstream = await startFakeUpstream();
        proxy = await startPreviewProxy({
            upstreamUrl: upstream.url,
            authorization: AUTHORIZATION,
            projectUuid: PROJECT_UUID,
            nonce: NONCE,
        });
    });

    afterEach(async () => {
        await proxy.close();
        await upstream.close();
    });

    it('forwards an allowlisted route with the credential attached', async () => {
        const res = await proxyFetch(
            `/api/v2/projects/${PROJECT_UUID}/query/metric-query`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `ApiKey ${NONCE}`,
                },
                body: JSON.stringify({ exploreName: 'orders' }),
            },
        );
        expect(res.status).toBe(200);
        expect(upstream.seen).toHaveLength(1);
        const forwarded = upstream.seen[0];
        expect(forwarded.method).toBe('POST');
        expect(forwarded.body).toBe('{"exploreName":"orders"}');
        // The browser-side scoped capability is replaced by the real credential…
        expect(forwarded.headers.authorization).toBe(AUTHORIZATION);
        // …and the run-scoped nonce never travels upstream.
        expect(forwarded.headers[PREVIEW_PROXY_NONCE_HEADER]).toBeUndefined();
    });

    it('stamps the signed-download header on schedule-download and nothing else', async () => {
        await proxyFetch(
            `/api/v2/projects/${PROJECT_UUID}/query/some-query-uuid/schedule-download`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `ApiKey ${NONCE}`,
                },
                body: JSON.stringify({ type: 'csv' }),
            },
        );
        await proxyFetch(
            `/api/v2/projects/${PROJECT_UUID}/query/some-query-uuid`,
        );
        expect(upstream.seen).toHaveLength(2);
        expect(
            upstream.seen[0].headers[
                LightdashSignedDownloadHeader.toLowerCase()
            ],
        ).toBe('true');
        expect(
            upstream.seen[1].headers[
                LightdashSignedDownloadHeader.toLowerCase()
            ],
        ).toBeUndefined();
    });

    it('preserves the query string on result polling', async () => {
        const res = await proxyFetch(
            `/api/v2/projects/${PROJECT_UUID}/query/some-query-uuid?page=2&pageSize=500`,
        );
        expect(res.status).toBe(200);
        expect(upstream.seen[0].url).toBe(
            `/api/v2/projects/${PROJECT_UUID}/query/some-query-uuid?page=2&pageSize=500`,
        );
    });

    it('rejects non-SDK routes without contacting upstream', async () => {
        const res = await proxyFetch('/api/v1/org/projects');
        expect(res.status).toBe(403);
        const body = (await res.json()) as { message: string };
        expect(body.message).toMatch(/not a data-app SDK route/);
        expect(upstream.seen).toHaveLength(0);
    });

    it('rejects allowlisted routes aimed at a different project', async () => {
        const res = await proxyFetch(
            '/api/v2/projects/other-project/query/metric-query',
            { method: 'POST' },
        );
        expect(res.status).toBe(403);
        const body = (await res.json()) as { message: string };
        expect(body.message).toMatch(/pinned to proj-uuid-1/);
        expect(upstream.seen).toHaveLength(0);
    });

    it('rejects allowlisted paths with the wrong method', async () => {
        const res = await proxyFetch('/api/v1/user', { method: 'POST' });
        expect(res.status).toBe(403);
        expect(upstream.seen).toHaveLength(0);
    });

    it('rejects requests without the per-run nonce', async () => {
        const missing = await proxyFetch('/api/v1/user', { nonce: null });
        expect(missing.status).toBe(401);
        const wrong = await proxyFetch('/api/v1/user', { nonce: 'guessed' });
        expect(wrong.status).toBe(401);
        expect(upstream.seen).toHaveLength(0);
    });

    it('rejects requests without the browser-side scoped capability', async () => {
        const missing = await proxyFetch('/api/v1/user', {
            authorization: null,
        });
        expect(missing.status).toBe(401);
        const wrong = await proxyFetch('/api/v1/user', {
            authorization: 'ApiKey guessed',
        });
        expect(wrong.status).toBe(401);
        expect(upstream.seen).toHaveLength(0);
    });

    it('does not pass upstream cookies back to the page', async () => {
        const res = await proxyFetch('/api/v1/user');
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('forwards service-account and reverse-proxy authorization', async () => {
        const serviceProxy = await startPreviewProxy({
            upstreamUrl: upstream.url,
            authorization: 'Bearer ldsvc_secret',
            proxyAuthorization: 'Basic reverse-proxy-secret',
            projectUuid: PROJECT_UUID,
            nonce: 'service-nonce',
        });

        try {
            const res = await fetch(
                `http://127.0.0.1:${serviceProxy.port}/api/v1/user`,
                {
                    headers: {
                        [PREVIEW_PROXY_NONCE_HEADER]: 'service-nonce',
                        authorization: 'ApiKey service-nonce',
                    },
                },
            );
            expect(res.status).toBe(200);
            const forwarded = upstream.seen.at(-1);
            expect(forwarded?.headers.authorization).toBe(
                'Bearer ldsvc_secret',
            );
            expect(forwarded?.headers['proxy-authorization']).toBe(
                'Basic reverse-proxy-secret',
            );
        } finally {
            await serviceProxy.close();
        }
    });
    describe('explore base-table virtual route', () => {
        const BASE_TABLE_PATH = '/__sdk/explore-base-table';

        const requestBaseTable = (
            path = BASE_TABLE_PATH,
            body: unknown = { exploreName: 'orders_with_custom_dims' },
            init: { nonce?: string | null } = {},
        ) =>
            proxyFetch(path, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
                ...init,
            });

        it('answers with only the base table, read upstream with the credential', async () => {
            upstream.setReply(() => ({
                status: 200,
                body: {
                    status: 'ok',
                    results: {
                        name: 'orders_with_custom_dims',
                        baseTable: 'orders',
                        tables: { orders: { sqlTable: 'secret.orders' } },
                    },
                },
            }));

            const res = await requestBaseTable();

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                status: 'ok',
                results: { baseTable: 'orders' },
            });
            expect(upstream.seen).toHaveLength(1);
            expect(upstream.seen[0].method).toBe('GET');
            expect(upstream.seen[0].url).toBe(
                `/api/v1/projects/${PROJECT_UUID}/explores/orders_with_custom_dims`,
            );
            expect(upstream.seen[0].headers.authorization).toBe(AUTHORIZATION);
            expect(
                upstream.seen[0].headers[PREVIEW_PROXY_NONCE_HEADER],
            ).toBeUndefined();
        });

        it('answers null when the upstream explore request fails', async () => {
            upstream.setReply(() => ({
                status: 403,
                body: { status: 'error', error: { message: 'Forbidden' } },
            }));

            const res = await requestBaseTable();

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                status: 'ok',
                results: { baseTable: null },
            });
        });

        it('answers null when the upstream body is not JSON', async () => {
            upstream.setReply(() => ({ status: 200, body: '<html>' }));

            const res = await requestBaseTable();

            expect(await res.json()).toEqual({
                status: 'ok',
                results: { baseTable: null },
            });
        });

        it('rejects a request without an explore name', async () => {
            const res = await requestBaseTable(BASE_TABLE_PATH, {
                exploreName: '',
            });

            expect(res.status).toBe(400);
            expect(upstream.seen).toHaveLength(0);
        });

        it('still requires the per-run nonce', async () => {
            const res = await requestBaseTable(BASE_TABLE_PATH, undefined, {
                nonce: null,
            });

            expect(res.status).toBe(401);
            expect(upstream.seen).toHaveLength(0);
        });
    });
});
