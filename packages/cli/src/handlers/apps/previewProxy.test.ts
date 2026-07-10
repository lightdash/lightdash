import * as http from 'http';
import {
    PREVIEW_PROXY_NONCE_HEADER,
    startPreviewProxy,
    type PreviewProxyHandle,
} from './previewProxy';

const PROJECT_UUID = 'proj-uuid-1';
const NONCE = 'test-nonce';
const API_KEY = 'ldpat_secret';

type SeenRequest = {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
};

/** Records every request and replies 200 with a JSON echo. */
const startFakeUpstream = (): Promise<{
    url: string;
    seen: SeenRequest[];
    close: () => Promise<void>;
}> => {
    const seen: SeenRequest[] = [];
    const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            seen.push({
                method: req.method ?? '',
                url: req.url ?? '',
                headers: req.headers,
                body: Buffer.concat(chunks).toString('utf-8'),
            });
            res.writeHead(200, {
                'content-type': 'application/json',
                'set-cookie': 'upstream=1',
            });
            res.end(JSON.stringify({ status: 'ok' }));
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as { port: number };
            resolve({
                url: `http://127.0.0.1:${port}`,
                seen,
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
        init: RequestInit & { nonce?: string | null } = {},
    ) => {
        const { nonce = NONCE, ...rest } = init;
        const headers = new Headers(rest.headers);
        if (nonce !== null) headers.set(PREVIEW_PROXY_NONCE_HEADER, nonce);
        return fetch(`http://127.0.0.1:${proxy.port}${path}`, {
            ...rest,
            headers,
        });
    };

    beforeEach(async () => {
        upstream = await startFakeUpstream();
        proxy = await startPreviewProxy({
            upstreamUrl: upstream.url,
            apiKey: API_KEY,
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
                    authorization: 'ApiKey preview-proxy-injected',
                },
                body: JSON.stringify({ exploreName: 'orders' }),
            },
        );
        expect(res.status).toBe(200);
        expect(upstream.seen).toHaveLength(1);
        const forwarded = upstream.seen[0];
        expect(forwarded.method).toBe('POST');
        expect(forwarded.body).toBe('{"exploreName":"orders"}');
        // The browser-side sentinel is replaced by the real credential…
        expect(forwarded.headers.authorization).toBe(`ApiKey ${API_KEY}`);
        // …and the run-scoped nonce never travels upstream.
        expect(forwarded.headers[PREVIEW_PROXY_NONCE_HEADER]).toBeUndefined();
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

    it('does not pass upstream cookies back to the page', async () => {
        const res = await proxyFetch('/api/v1/user');
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toBeNull();
    });
});
