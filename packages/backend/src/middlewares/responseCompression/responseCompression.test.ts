import express from 'express';
import http, { type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';
import { responseCompression } from './responseCompression';

type RawResponse = {
    status: number;
    headers: IncomingHttpHeaders;
    body: Buffer;
};

const largePayload = {
    rows: Array.from({ length: 500 }, (_, index) => ({
        orders_customer_id: { value: { raw: index, formatted: `${index}` } },
        orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    })),
};

const releaseSecondEvent: { current: () => void } = { current: () => {} };

const buildApp = () => {
    const app = express();
    app.use('/api', responseCompression());

    app.get('/api/large', (_req, res) => {
        res.json(largePayload);
    });
    app.get('/api/small', (_req, res) => {
        res.json({ status: 'ok' });
    });
    app.get('/outside-api/large', (_req, res) => {
        res.json(largePayload);
    });
    app.get('/api/stream-json', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const chunks = [
            '{"rows":[',
            ...largePayload.rows.map(
                (row, index) =>
                    `${index === 0 ? '' : ','}${JSON.stringify(row)}`,
            ),
            ']}',
        ];
        await pipeline(Readable.from(chunks), res);
    });
    app.get('/api/sse', (_req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
        });
        res.write(`event: first\ndata: ${'x'.repeat(2048)}\n\n`);
        releaseSecondEvent.current = () => {
            res.write('event: second\ndata: {}\n\n');
            res.end();
        };
    });
    app.get('/api/csv-download', (_req, res) => {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="a.csv"');
        res.send('id,name\n'.repeat(1000));
    });
    app.get('/api/json-download', (_req, res) => {
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="results.json"',
        );
        res.json(largePayload);
    });
    app.get('/api/pre-gzipped', (_req, res) => {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json');
        res.end(zlib.gzipSync(JSON.stringify(largePayload)));
    });
    return app;
};

let server: http.Server;
let port: number;

beforeAll(async () => {
    server = buildApp().listen(0);
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

const request = (path: string, acceptEncoding?: string): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
        http.get(
            {
                port,
                path,
                headers: acceptEncoding
                    ? { 'Accept-Encoding': acceptEncoding }
                    : {},
            },
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
        ).on('error', reject);
    });

const decode = ({ headers, body }: RawResponse): Buffer => {
    switch (headers['content-encoding']) {
        case 'br':
            return zlib.brotliDecompressSync(body);
        case 'gzip':
            return zlib.gunzipSync(body);
        case undefined:
            return body;
        default:
            throw new Error(`Unexpected ${headers['content-encoding']}`);
    }
};

const browserAcceptEncoding = 'gzip, deflate, br, zstd';

describe('responseCompression', () => {
    it('compresses a large JSON response with brotli when the browser accepts it', async () => {
        const response = await request('/api/large', browserAcceptEncoding);

        expect(response.status).toBe(200);
        expect(response.headers['content-encoding']).toBe('br');
        expect(response.headers.vary).toMatch(/accept-encoding/i);
        expect(response.body.length).toBeLessThan(
            JSON.stringify(largePayload).length / 5,
        );
        expect(JSON.parse(decode(response).toString())).toEqual(largePayload);
    });

    it('uses gzip when the client only accepts gzip', async () => {
        const response = await request('/api/large', 'gzip');

        expect(response.headers['content-encoding']).toBe('gzip');
        expect(JSON.parse(decode(response).toString())).toEqual(largePayload);
    });

    it('does not compress without an accept-encoding header', async () => {
        const response = await request('/api/large');

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(JSON.parse(response.body.toString())).toEqual(largePayload);
    });

    it('does not compress a JSON response below the threshold', async () => {
        const response = await request('/api/small', browserAcceptEncoding);

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(JSON.parse(response.body.toString())).toEqual({
            status: 'ok',
        });
    });

    it('does not touch routes outside the mount path', async () => {
        const response = await request(
            '/outside-api/large',
            browserAcceptEncoding,
        );

        expect(response.headers['content-encoding']).toBeUndefined();
    });

    it('compresses a streamed JSON response', async () => {
        const response = await request(
            '/api/stream-json',
            browserAcceptEncoding,
        );

        expect(response.headers['content-encoding']).toBe('br');
        expect(JSON.parse(decode(response).toString())).toEqual(largePayload);
    });

    it('leaves server-sent events uncompressed and streams each event as it is written', async () => {
        const firstChunk = await new Promise<{
            headers: IncomingHttpHeaders;
            text: string;
            rest: Promise<string>;
        }>((resolve, reject) => {
            http.get(
                {
                    port,
                    path: '/api/sse',
                    headers: { 'Accept-Encoding': browserAcceptEncoding },
                },
                (res) => {
                    let received = '';
                    let resolveRest: (text: string) => void = () => {};
                    const rest = new Promise<string>((done) => {
                        resolveRest = done;
                    });
                    res.on('data', (chunk: Buffer) => {
                        const isFirst = received === '';
                        received += chunk.toString();
                        if (isFirst) {
                            resolve({
                                headers: res.headers,
                                text: received,
                                rest,
                            });
                        }
                    });
                    res.on('end', () => resolveRest(received));
                },
            ).on('error', reject);
        });

        expect(firstChunk.headers['content-encoding']).toBeUndefined();
        expect(firstChunk.headers['content-type']).toBe('text/event-stream');
        expect(firstChunk.text).toContain('event: first');
        expect(firstChunk.text).not.toContain('event: second');

        releaseSecondEvent.current();
        expect(await firstChunk.rest).toContain('event: second');
    });

    it('leaves a CSV file download uncompressed', async () => {
        const response = await request(
            '/api/csv-download',
            browserAcceptEncoding,
        );

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.body.toString()).toBe('id,name\n'.repeat(1000));
    });

    it('leaves a JSON file download uncompressed', async () => {
        const response = await request(
            '/api/json-download',
            browserAcceptEncoding,
        );

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(JSON.parse(response.body.toString())).toEqual(largePayload);
    });

    it('does not re-encode a response that is already compressed', async () => {
        const response = await request(
            '/api/pre-gzipped',
            browserAcceptEncoding,
        );

        expect(response.headers['content-encoding']).toBe('gzip');
        expect(JSON.parse(zlib.gunzipSync(response.body).toString())).toEqual(
            largePayload,
        );
    });
});
