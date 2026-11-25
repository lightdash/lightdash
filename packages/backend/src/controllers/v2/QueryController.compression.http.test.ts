import { Ability } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { fetchMiddlewares } from '@tsoa/runtime';
import express, {
    type ErrorRequestHandler,
    type RequestHandler,
} from 'express';
import http, { type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';
import { Readable } from 'stream';
import zlib from 'zlib';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfig } from '../../config/lightdashConfig';
import { AiAgentController } from '../../ee/controllers/aiAgentController';
import { RegisterRoutes } from '../../generated/routes';
import { compressResultsPage } from '../../middlewares/responseCompression/responseCompression';
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
const streamPath = `/api/v2/projects/${projectUuid}/query/${queryUuid}/results`;

const resultsPage = {
    queryUuid,
    status: 'ready',
    page: 1,
    pageSize: 500,
    totalPageCount: 2,
    totalResults: 1000,
    rows: Array.from({ length: 500 }, (_, index) => ({
        orders_order_id: { value: { raw: index, formatted: `${index}` } },
        orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    })),
};
const streamBody = JSON.stringify(resultsPage.rows);

type RawResponse = {
    status: number;
    headers: IncomingHttpHeaders;
    body: Buffer;
};

let server: http.Server;
let port: number;

beforeAll(async () => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const asyncQueryService = {
        getAsyncQueryResults: vi.fn(async () => resultsPage),
        getResultsStream: vi.fn(async () => Readable.from([streamBody])),
    };
    const app = express();
    app.use((request, response, next) => {
        request.account = account;
        request.services = {
            getAsyncQueryService: () => asyncQueryService,
        } as unknown as ServiceRepository;
        response.vary('Origin');
        next();
    });
    app.get('/api/v1/test-events', (_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(`data: ${'x'.repeat(4096)}\n\n`);
    });
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

const request = (
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
        const req = http.request({ port, path, method, headers }, (res) => {
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
        });
        req.setTimeout(5000, () => req.destroy(new Error('timed out')));
        req.on('error', reject);
        req.end();
    });

const browserAcceptEncoding = { 'Accept-Encoding': 'gzip, deflate, br, zstd' };

describe('results page compression through the generated route', () => {
    it('compresses the results page once with brotli and keeps existing Vary values', async () => {
        const response = await request(resultsPath, browserAcceptEncoding);

        expect(response.status).toBe(200);
        expect(response.headers['content-encoding']).toBe('br');
        expect(response.headers.vary).toBe('Origin, Accept-Encoding');
        const decoded = JSON.parse(
            zlib.brotliDecompressSync(response.body).toString(),
        );
        expect(decoded).toEqual({ status: 'ok', results: resultsPage });
    });

    it('uses gzip for a gzip-only client and nothing without accept-encoding', async () => {
        const gzip = await request(resultsPath, { 'Accept-Encoding': 'gzip' });
        const identity = await request(resultsPath);

        expect(gzip.headers['content-encoding']).toBe('gzip');
        expect(JSON.parse(zlib.gunzipSync(gzip.body).toString())).toEqual({
            status: 'ok',
            results: resultsPage,
        });
        expect(identity.headers['content-encoding']).toBeUndefined();
        expect(identity.headers.vary).toBe('Origin, Accept-Encoding');
        expect(JSON.parse(identity.body.toString()).results).toEqual(
            resultsPage,
        );
    });

    it('answers a revalidation with an empty 304 that keeps the same Vary', async () => {
        const first = await request(resultsPath, browserAcceptEncoding);
        const etag = first.headers.etag as string;
        expect(etag).toBeTruthy();

        const revalidated = await request(resultsPath, {
            ...browserAcceptEncoding,
            'If-None-Match': etag,
        });

        expect(revalidated.status).toBe(304);
        expect(revalidated.body.length).toBe(0);
        expect(revalidated.headers['content-encoding']).toBeUndefined();
        expect(revalidated.headers.vary).toBe(first.headers.vary);
    });

    it('answers HEAD with the same metadata as GET', async () => {
        const get = await request(resultsPath, browserAcceptEncoding);
        const head = await request(resultsPath, browserAcceptEncoding, 'HEAD');

        expect(head.status).toBe(200);
        expect(head.body.length).toBe(0);
        expect(head.headers['content-encoding']).toBe('br');
        expect(head.headers['content-length']).toBe(String(get.body.length));
        expect(head.headers.etag).toBe(get.headers.etag);
        expect(head.headers.vary).toBe(get.headers.vary);
    });

    it('leaves the S3 results stream route uncompressed', async () => {
        const response = await request(streamPath, browserAcceptEncoding);

        expect(response.status).toBe(200);
        expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.headers.vary).toBe('Origin');
        expect(response.body.toString()).toBe(streamBody);
    });

    it('leaves a server-sent events route uncompressed', async () => {
        const response = await request(
            '/api/v1/test-events',
            browserAcceptEncoding,
        );

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.headers.vary).toBe('Origin');
        expect(response.body.toString()).toBe(`data: ${'x'.repeat(4096)}\n\n`);
    });

    it('sends the results page uncompressed when HTTP_RESPONSE_COMPRESSION_ENABLED is false', async () => {
        const original = lightdashConfig.httpServer.responseCompressionEnabled;
        lightdashConfig.httpServer.responseCompressionEnabled = false;
        try {
            const response = await request(resultsPath, browserAcceptEncoding);

            expect(response.headers['content-encoding']).toBeUndefined();
            expect(response.headers.vary).toBe('Origin');
            expect(JSON.parse(response.body.toString()).results).toEqual(
                resultsPage,
            );
        } finally {
            lightdashConfig.httpServer.responseCompressionEnabled = original;
        }
    });
});

test.each([
    'getAgentThreadNodeCitationQueryResults',
    'getArtifactQueryResults',
] as const)(
    'the AI agent results page %s uses the same compression',
    (method) => {
        expect(
            fetchMiddlewares<RequestHandler>(
                AiAgentController.prototype[method],
            ).flat(),
        ).toContain(compressResultsPage);
    },
);
