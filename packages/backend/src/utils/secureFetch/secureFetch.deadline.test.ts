import dns from 'dns/promises';
import http from 'http';
import { AddressInfo } from 'net';
import nodeFetch from 'node-fetch';
import { secureFetch, SecureFetchError } from './secureFetch';

vi.mock('dns/promises', () => ({
    __esModule: true,
    default: { lookup: vi.fn() },
}));
// Real node-fetch over a real socket; only TLS is swapped out for plain HTTP.
vi.mock('node-fetch', async () => {
    const actual =
        await vi.importActual<typeof import('node-fetch')>('node-fetch');
    return { ...actual, __esModule: true, default: vi.fn() };
});

const TIMEOUT_MS = 100;
const SETTLE_WAIT_MS = 2000;

const OPTIONS = {
    method: 'GET' as const,
    timeoutMs: TIMEOUT_MS,
    maxResponseBytes: 1024,
    allowedContentTypes: ['application/json'],
};

type Route = (res: http.ServerResponse) => void;

const routes: Record<string, Route> = {
    '/fast': (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
    },
    '/late-body': (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"ok":');
        setTimeout(() => res.end('true}'), TIMEOUT_MS * 3);
    },
    '/stalled-body': (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{');
    },
    '/oversized-stream': (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('x'.repeat(OPTIONS.maxResponseBytes + 1));
    },
    '/disallowed-type': (res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.write('x');
    },
    '/redirect': (res) => {
        res.writeHead(302, { location: 'https://example.com/elsewhere' });
        res.write('x');
    },
    '/declared-too-large': (res) => {
        res.writeHead(200, {
            'content-type': 'application/json',
            'content-length': String(OPTIONS.maxResponseBytes + 1),
        });
        res.write('x');
    },
};

describe('secureFetch response lifecycle', () => {
    const socketClosed: Record<string, Promise<void>> = {};
    let server: http.Server;
    let origin: string;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            const path = req.url ?? '';
            socketClosed[path] = new Promise((resolve) => {
                req.socket.once('close', () => resolve());
            });
            routes[path](res);
        });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

        const actual =
            await vi.importActual<typeof import('node-fetch')>('node-fetch');
        (dns.lookup as unknown as import('vitest').Mock).mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
        ]);
        (nodeFetch as unknown as import('vitest').Mock).mockImplementation(
            (url: string, init: Record<string, unknown>) =>
                actual.default(url.replace('https://example.com', origin), {
                    ...init,
                    agent: undefined,
                }),
        );
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => {
            server.close(resolve);
        });
    });

    const expectFailure = async (path: string, reason: string) => {
        const outcome = await Promise.race([
            secureFetch(`https://example.com${path}`, OPTIONS).then(
                () => 'resolved',
                (error: SecureFetchError) => error.reason,
            ),
            new Promise((resolve) => {
                setTimeout(() => resolve('still pending'), SETTLE_WAIT_MS);
            }),
        ]);
        expect(outcome).toBe(reason);
    };

    const expectSocketClosed = async (path: string) => {
        const outcome = await Promise.race([
            socketClosed[path].then(() => 'closed'),
            new Promise((resolve) => {
                setTimeout(() => resolve('still open'), SETTLE_WAIT_MS);
            }),
        ]);
        expect(outcome).toBe('closed');
    };

    it('returns a body that completes within the timeout', async () => {
        const result = await secureFetch('https://example.com/fast', OPTIONS);
        expect(result.bodyText).toBe('{"ok":true}');
    });

    it.each(['/late-body', '/stalled-body'])(
        'times out when %s does not complete within the timeout',
        async (path) => {
            await expectFailure(path, 'timeout');
            await expectSocketClosed(path);
        },
    );

    it.each([
        ['/disallowed-type', 'disallowed_content_type'],
        ['/redirect', 'redirect'],
        ['/declared-too-large', 'too_large'],
        ['/oversized-stream', 'too_large'],
    ])('closes the connection after rejecting %s', async (path, reason) => {
        await expectFailure(path, reason);
        await expectSocketClosed(path);
    });
});
