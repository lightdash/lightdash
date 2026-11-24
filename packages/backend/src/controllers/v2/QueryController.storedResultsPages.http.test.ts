import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import express, {
    type ErrorRequestHandler,
    type RequestHandler,
} from 'express';
import http, { type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';
import zlib from 'zlib';
import { buildAccount } from '../../auth/account/account.mock';
import { RegisterRoutes } from '../../generated/routes';
import { type ServiceRepository } from '../../services/ServiceRepository';

vi.mock('../authentication', async (importOriginal) => {
    const original = await importOriginal<typeof import('../authentication')>();
    const pass: RequestHandler = (_request, _response, next) => next();
    return {
        ...original,
        allowApiKeyAuthentication: pass,
        isAuthenticated: pass,
    };
});

const projectUuid = '3675b69e-8324-4110-bdca-059031aa8da3';
const queryUuid = 'a9dac289-0e55-4cba-ba00-c4c0cad03e13';
const resultsPath = `/api/v2/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`;

const results = {
    rows: Array.from({ length: 500 }, (_, index) => ({
        orders_order_id: { value: { raw: index, formatted: `${index}` } },
        orders_note: {
            value: { raw: 'a\u2028b', formatted: 'a\u2028b' },
        },
    })),
    columns: {},
    queryUuid,
    status: 'ready',
    page: 1,
    pageSize: 500,
    totalPageCount: 2,
    totalResults: 1000,
};
const serialisedBody = Buffer.from(JSON.stringify({ status: 'ok', results }));

type RawResponse = {
    status: number;
    headers: IncomingHttpHeaders;
    body: Buffer;
};

let mode: 'body' | 'results' = 'body';
let sendDelayMs = 0;
let server: http.Server;
let port: number;

const deferSend: RequestHandler = (_request, response, next) => {
    if (sendDelayMs > 0) {
        const send = response.send.bind(response);
        response.send = (body?: unknown) => {
            setTimeout(() => send(body), sendDelayMs);
            return response;
        };
    }
    next();
};

beforeAll(async () => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const asyncQueryService = {
        getAsyncQueryResultsResponse: vi.fn(async () =>
            mode === 'body'
                ? { kind: 'body', body: Buffer.from(serialisedBody) }
                : { kind: 'results', results },
        ),
    };
    const app = express();
    app.use((request, response, next) => {
        request.account = account;
        request.services = {
            getAsyncQueryService: () => asyncQueryService,
        } as unknown as ServiceRepository;
        next();
    });
    app.use(deferSend);
    RegisterRoutes(app);
    const errors: ErrorRequestHandler = (error, _request, response, _next) => {
        response
            .status(error.status ?? error.statusCode ?? 500)
            .json({ error: error.message });
    };
    app.use(errors);
    server = app.listen(0);
    await new Promise<void>((resolve) => {
        server.once('listening', () => resolve());
    });
    port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
});

afterEach(() => {
    mode = 'body';
    sendDelayMs = 0;
});

const request = (
    headers: Record<string, string> = {},
    method = 'GET',
): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
        const req = http.request(
            { port, path: resultsPath, method, headers },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    }),
                );
                res.on('error', reject);
            },
        );
        req.setTimeout(5000, () => req.destroy(new Error('timed out')));
        req.on('error', reject);
        req.end();
    });

const browserAcceptEncoding = { 'Accept-Encoding': 'gzip, deflate, br, zstd' };

describe('stored results page body through the generated route', () => {
    test('sends the same bytes and headers as the object response', async () => {
        mode = 'results';
        const today = await request();
        mode = 'body';
        const stored = await request();

        expect(stored.status).toBe(200);
        expect(stored.body.equals(serialisedBody)).toBe(true);
        expect(stored.body.equals(today.body)).toBe(true);
        expect(stored.headers['content-type']).toBe(
            today.headers['content-type'],
        );
        expect(stored.headers['content-type']).toBe(
            'application/json; charset=utf-8',
        );
        expect(stored.headers['content-length']).toBe(
            today.headers['content-length'],
        );
        expect(stored.headers.etag).toBe(today.headers.etag);
    });

    test('is compressed once with brotli and decodes to the same bytes', async () => {
        const response = await request(browserAcceptEncoding);

        expect(response.status).toBe(200);
        expect(response.headers['content-encoding']).toBe('br');
        expect(
            zlib.brotliDecompressSync(response.body).equals(serialisedBody),
        ).toBe(true);
    });

    test('waits for an async send instead of ending with 204', async () => {
        sendDelayMs = 50;

        const plain = await request();
        const compressed = await request(browserAcceptEncoding);

        expect(plain.status).toBe(200);
        expect(plain.body.equals(serialisedBody)).toBe(true);
        expect(compressed.status).toBe(200);
        expect(compressed.headers['content-encoding']).toBe('br');
        expect(
            zlib.brotliDecompressSync(compressed.body).equals(serialisedBody),
        ).toBe(true);
    });

    test('answers a revalidation with an empty 304', async () => {
        const first = await request(browserAcceptEncoding);
        const revalidated = await request({
            ...browserAcceptEncoding,
            'If-None-Match': first.headers.etag as string,
        });

        expect(revalidated.status).toBe(304);
        expect(revalidated.body.length).toBe(0);
    });

    test('answers HEAD with the same metadata as GET', async () => {
        const get = await request(browserAcceptEncoding);
        const head = await request(browserAcceptEncoding, 'HEAD');

        expect(head.status).toBe(200);
        expect(head.body.length).toBe(0);
        expect(head.headers['content-length']).toBe(String(get.body.length));
        expect(head.headers.etag).toBe(get.headers.etag);
    });
});
