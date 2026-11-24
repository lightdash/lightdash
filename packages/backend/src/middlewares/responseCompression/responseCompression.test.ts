import express from 'express';
import http, { type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';
import zlib from 'zlib';
import { createResponseCompression } from './responseCompression';

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

let server: http.Server;
let port: number;

beforeAll(async () => {
    const app = express();
    const compress = createResponseCompression();
    app.get('/large', compress, (_req, res) => {
        res.json(largePayload);
    });
    app.get('/small', compress, (_req, res) => {
        res.json({ status: 'ok' });
    });
    app.get('/csv', compress, (_req, res) => {
        res.type('text/csv').send('id,name\n'.repeat(1000));
    });
    app.get('/pre-gzipped', compress, (_req, res) => {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json');
        res.end(zlib.gzipSync(JSON.stringify(largePayload)));
    });
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

const request = (path: string, acceptEncoding?: string): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
        const req = http.get(
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
        );
        req.setTimeout(5000, () => req.destroy(new Error('timed out')));
        req.on('error', reject);
    });

const browserAcceptEncoding = 'gzip, deflate, br, zstd';

describe('createResponseCompression', () => {
    it('compresses a large JSON response with brotli quality 1', async () => {
        const response = await request('/large', browserAcceptEncoding);
        const body = Buffer.from(JSON.stringify(largePayload));

        expect(response.headers['content-encoding']).toBe('br');
        expect(response.headers.vary).toBe('Accept-Encoding');
        expect(response.headers['content-length']).toBe(
            String(response.body.length),
        );
        expect(response.body).toEqual(
            zlib.brotliCompressSync(body, {
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
                    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
                },
            }),
        );
    });

    it('prefers brotli over gzip whatever order the client lists them in', async () => {
        const response = await request('/large', 'gzip, deflate, br');

        expect(response.headers['content-encoding']).toBe('br');
    });

    it('uses gzip when the client refuses brotli', async () => {
        const response = await request('/large', 'br;q=0, gzip');

        expect(response.headers['content-encoding']).toBe('gzip');
        expect(JSON.parse(zlib.gunzipSync(response.body).toString())).toEqual(
            largePayload,
        );
    });

    it('does not compress without an accepted encoding', async () => {
        const response = await request('/large', 'identity');

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.headers.vary).toBe('Accept-Encoding');
        expect(JSON.parse(response.body.toString())).toEqual(largePayload);
    });

    it('does not compress a JSON response below 1KB', async () => {
        const response = await request('/small', browserAcceptEncoding);

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.headers.vary).toBe('Accept-Encoding');
        expect(JSON.parse(response.body.toString())).toEqual({
            status: 'ok',
        });
    });

    it('does not compress a response that is not JSON', async () => {
        const response = await request('/csv', browserAcceptEncoding);

        expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.body.toString()).toBe('id,name\n'.repeat(1000));
    });

    it('compresses in one zlib job rather than in 16KB steps', async () => {
        const spy = vi.spyOn(zlib, 'brotliCompress');
        try {
            await request('/large', browserAcceptEncoding);
            const [body, options] = spy.mock.calls[0] as unknown as [
                Buffer,
                zlib.BrotliOptions,
            ];
            expect(options.chunkSize).toBeGreaterThanOrEqual(body.length / 4);
        } finally {
            spy.mockRestore();
        }
    });

    it('sends the body uncompressed when compression fails', async () => {
        const spy = vi
            .spyOn(zlib, 'brotliCompress')
            .mockImplementationOnce(((
                _body: Buffer,
                _options: zlib.BrotliOptions,
                callback: zlib.CompressCallback,
            ) =>
                callback(
                    new Error('compression failed'),
                    Buffer.alloc(0),
                )) as typeof zlib.brotliCompress);
        try {
            const response = await request('/large', browserAcceptEncoding);

            expect(response.status).toBe(200);
            expect(response.headers['content-encoding']).toBeUndefined();
            expect(JSON.parse(response.body.toString())).toEqual(largePayload);
        } finally {
            spy.mockRestore();
        }
    });

    it('does not re-encode a response that is already compressed', async () => {
        const response = await request('/pre-gzipped', browserAcceptEncoding);

        expect(response.headers['content-encoding']).toBe('gzip');
        expect(JSON.parse(zlib.gunzipSync(response.body).toString())).toEqual(
            largePayload,
        );
    });
});
