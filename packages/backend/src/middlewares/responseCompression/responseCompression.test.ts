import express, { type Response } from 'express';
import http, { type IncomingHttpHeaders } from 'http';
import type { AddressInfo } from 'net';
import zlib from 'zlib';
import {
    compressionChunkSize,
    createResponseCompression,
    RESPONSE_COMPRESSION_MAX_CHUNK_BYTES,
} from './responseCompression';

type RawResponse = {
    status: number;
    headers: IncomingHttpHeaders;
    body: Buffer;
};

type Deferred<T = void> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
};

const deferred = <T = void>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

const largePayload = {
    rows: Array.from({ length: 2000 }, (_, index) => ({
        orders_customer_id: { value: { raw: index, formatted: `${index}` } },
        orders_status: { value: { raw: 'completed', formatted: 'Completed' } },
    })),
};
const largeBody = Buffer.from(JSON.stringify(largePayload));
const otherPayload = { rows: largePayload.rows.slice(0, 1000) };
const MAX_CHUNK_FOR_TESTS = 32 * 1024;

let server: http.Server;
let port: number;
let observedResponse: Response | undefined;

const realBrotliCompress = zlib.brotliCompress;

beforeAll(async () => {
    const app = express();
    const compress = createResponseCompression();
    const compressWithSmallChunks = createResponseCompression({
        maxChunkBytes: MAX_CHUNK_FOR_TESTS,
    });
    const compressWithBudget = createResponseCompression({
        maxInFlightBytes: Math.ceil(largeBody.length * 1.5),
    });
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
        res.type('application/json');
        res.send(zlib.gzipSync(largeBody));
    });
    app.get('/observed', compress, (_req, res) => {
        observedResponse = res;
        res.json(largePayload);
    });
    app.get('/then-end', compress, (_req, res) => {
        observedResponse = res;
        res.json(largePayload);
        res.end('other');
    });
    app.get('/then-send', compress, (_req, res) => {
        res.json(largePayload);
        res.json(otherPayload);
    });
    app.get('/small-chunks', compressWithSmallChunks, (_req, res) => {
        res.json(largePayload);
    });
    app.get('/budget', compressWithBudget, (_req, res) => {
        res.json(largePayload);
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

afterEach(() => {
    vi.restoreAllMocks();
    observedResponse = undefined;
});

const startRequest = (path: string, acceptEncoding?: string) => {
    let clientRequest!: http.ClientRequest;
    const response = new Promise<RawResponse>((resolve, reject) => {
        clientRequest = http.get(
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
        clientRequest.setTimeout(5000, () =>
            clientRequest.destroy(new Error('timed out')),
        );
        clientRequest.on('error', reject);
    });
    return { clientRequest, response };
};

const request = (path: string, acceptEncoding?: string) =>
    startRequest(path, acceptEncoding).response;

const failingEncoder = ((
    _body: Buffer,
    _options: unknown,
    callback: zlib.CompressCallback,
) =>
    callback(
        new Error('compression failed'),
        Buffer.alloc(0),
    )) as typeof zlib.brotliCompress;

const holdNextBrotliCompress = () => {
    const started = deferred();
    const release = deferred();
    const finished = deferred();
    vi.spyOn(zlib, 'brotliCompress').mockImplementationOnce(((
        body: Buffer,
        options: zlib.BrotliOptions,
        callback: zlib.CompressCallback,
    ) => {
        started.resolve();
        void release.promise.then(() =>
            realBrotliCompress(body, options, (error, result) => {
                callback(error, result);
                setImmediate(() => finished.resolve());
            }),
        );
    }) as typeof zlib.brotliCompress);
    return { started, release, finished };
};

const captureUnhandledRejections = () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    return {
        rejections,
        stop: () => process.off('unhandledRejection', onRejection),
    };
};

const decodeJson = (response: RawResponse) => {
    const encoding = response.headers['content-encoding'];
    if (encoding === 'br') {
        return JSON.parse(zlib.brotliDecompressSync(response.body).toString());
    }
    if (encoding === 'gzip') {
        return JSON.parse(zlib.gunzipSync(response.body).toString());
    }
    return JSON.parse(response.body.toString());
};

const browserAcceptEncoding = 'gzip, deflate, br, zstd';

describe('createResponseCompression', () => {
    it('compresses a large JSON response with brotli quality 1', async () => {
        const response = await request('/large', browserAcceptEncoding);

        expect(response.headers['content-encoding']).toBe('br');
        expect(response.headers.vary).toBe('Accept-Encoding');
        expect(response.headers['content-length']).toBe(
            String(response.body.length),
        );
        expect(response.body).toEqual(
            zlib.brotliCompressSync(largeBody, {
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 1,
                    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: largeBody.length,
                },
            }),
        );
    });

    describe('encoding negotiation', () => {
        it.each([
            ['gzip, deflate, br', 'br'],
            ['br, gzip', 'br'],
            ['br;q=0, gzip', 'gzip'],
            ['gzip;q=1, br;q=0.1', 'gzip'],
            ['br;q=0.5, gzip;q=0.8', 'gzip'],
            ['br;q=0.5, gzip;q=0.5', 'br'],
            ['*', 'br'],
            ['*;q=0.5, gzip', 'gzip'],
            ['*, br;q=0', 'gzip'],
            ['gzip;q=0, *', 'br'],
            ['identity;q=1, gzip;q=0.5', undefined],
            ['identity', undefined],
            ['*;q=0, identity', undefined],
            ['deflate', undefined],
            [undefined, undefined],
        ])(
            'answers Accept-Encoding %s with %s',
            async (acceptEncoding, expected) => {
                const response = await request('/large', acceptEncoding);

                expect(response.status).toBe(200);
                expect(response.headers['content-encoding']).toBe(expected);
                expect(response.headers.vary).toBe('Accept-Encoding');
                expect(decodeJson(response)).toEqual(largePayload);
            },
        );

        it.each(['*;q=0', 'identity;q=0', 'deflate, identity;q=0'])(
            'sends an empty 406 when %s refuses every encoding',
            async (acceptEncoding) => {
                const response = await request('/large', acceptEncoding);

                expect(response.status).toBe(406);
                expect(response.body.length).toBe(0);
                expect(response.headers['content-encoding']).toBeUndefined();
                expect(response.headers['content-type']).toBeUndefined();
            },
        );

        it('compresses a body below 1KB when the client refuses identity', async () => {
            const response = await request('/small', 'gzip, identity;q=0');

            expect(response.headers['content-encoding']).toBe('gzip');
            expect(decodeJson(response)).toEqual({ status: 'ok' });
        });
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

    it('does not re-encode a body sent with a Content-Encoding', async () => {
        const response = await request('/pre-gzipped', browserAcceptEncoding);

        expect(response.headers['content-encoding']).toBe('gzip');
        expect(response.body).toEqual(zlib.gzipSync(largeBody));
    });

    describe('chunk policy', () => {
        it.each([
            [100, zlib.constants.Z_DEFAULT_CHUNK],
            [1024 * 1024, 256 * 1024],
            [31 * 1024 * 1024, RESPONSE_COMPRESSION_MAX_CHUNK_BYTES],
        ])('uses %i-byte bodies with %i-byte chunks', (length, expected) => {
            expect(compressionChunkSize(length)).toBe(expected);
        });

        it.each([
            ['br', 'brotliCompress'],
            ['gzip', 'gzip'],
        ] as const)(
            'makes one %s call with a quarter-body chunk',
            async (acceptEncoding, method) => {
                const spy = vi.spyOn(zlib, method);

                const response = await request('/large', acceptEncoding);

                expect(response.headers['content-encoding']).toBe(
                    acceptEncoding,
                );
                expect(spy).toHaveBeenCalledTimes(1);
                const [body, options] = spy.mock.calls[0] as unknown as [
                    Buffer,
                    zlib.ZlibOptions,
                ];
                expect(body).toEqual(largeBody);
                expect(options.chunkSize).toBe(
                    Math.ceil(largeBody.length / 4),
                );
            },
        );

        it.each([
            ['br', 'brotliCompress'],
            ['gzip', 'gzip'],
        ] as const)(
            'caps the %s chunk at the configured ceiling',
            async (acceptEncoding, method) => {
                const spy = vi.spyOn(zlib, method);

                const response = await request('/small-chunks', acceptEncoding);

                expect(decodeJson(response)).toEqual(largePayload);
                expect(spy).toHaveBeenCalledTimes(1);
                const [, options] = spy.mock.calls[0] as unknown as [
                    Buffer,
                    zlib.ZlibOptions,
                ];
                expect(options.chunkSize).toBe(MAX_CHUNK_FOR_TESTS);
            },
        );
    });

    describe('encoder failure', () => {
        it('sends the body uncompressed when identity is acceptable', async () => {
            vi.spyOn(zlib, 'brotliCompress').mockImplementationOnce(
                failingEncoder,
            );

            const response = await request('/large', browserAcceptEncoding);

            expect(response.status).toBe(200);
            expect(response.headers['content-encoding']).toBeUndefined();
            expect(JSON.parse(response.body.toString())).toEqual(largePayload);
        });

        it('falls back to the next accepted encoding when identity is refused', async () => {
            vi.spyOn(zlib, 'brotliCompress').mockImplementationOnce(
                failingEncoder,
            );

            const response = await request('/large', 'br, gzip, identity;q=0');

            expect(response.status).toBe(200);
            expect(response.headers['content-encoding']).toBe('gzip');
            expect(decodeJson(response)).toEqual(largePayload);
        });

        it('sends an empty 406 when no accepted encoding works', async () => {
            vi.spyOn(zlib, 'gzip').mockImplementationOnce(
                failingEncoder as unknown as typeof zlib.gzip,
            );

            const response = await request('/large', 'gzip, identity;q=0');

            expect(response.status).toBe(406);
            expect(response.body.length).toBe(0);
            expect(response.headers['content-encoding']).toBeUndefined();
        });
    });

    describe('response committed while compression is pending', () => {
        it('does not write after the client disconnects', async () => {
            const held = holdNextBrotliCompress();
            const { clientRequest, response } = startRequest(
                '/observed',
                browserAcceptEncoding,
            );
            response.catch(() => undefined);
            await held.started.promise;
            const closed = deferred();
            observedResponse!.once('close', () => closed.resolve());
            clientRequest.destroy();
            await closed.promise;

            held.release.resolve();
            await held.finished.promise;

            expect(observedResponse!.getHeader('Content-Encoding')).toBe(
                undefined,
            );
            expect(observedResponse!.writableEnded).toBe(false);
        });

        it('leaves a response that another write already ended', async () => {
            const unhandled = captureUnhandledRejections();
            try {
                const held = holdNextBrotliCompress();
                const response = request('/then-end', browserAcceptEncoding);
                await held.started.promise;

                const received = await response;
                held.release.resolve();
                await held.finished.promise;
                await new Promise((resolve) => {
                    setImmediate(resolve);
                });

                expect(received.body.toString()).toBe('other');
                expect(received.headers['content-encoding']).toBeUndefined();
                expect(observedResponse!.getHeader('Content-Encoding')).toBe(
                    undefined,
                );
                expect(unhandled.rejections).toEqual([]);
            } finally {
                unhandled.stop();
            }
        });

        it('lets the latest send own the response', async () => {
            const unhandled = captureUnhandledRejections();
            try {
                const held = holdNextBrotliCompress();

                const received = await request(
                    '/then-send',
                    browserAcceptEncoding,
                );
                held.release.resolve();
                await held.finished.promise;
                await new Promise((resolve) => {
                    setImmediate(resolve);
                });

                expect(received.status).toBe(200);
                expect(decodeJson(received)).toEqual(otherPayload);
                expect(unhandled.rejections).toEqual([]);
            } finally {
                unhandled.stop();
            }
        });
    });

    describe('in-flight byte budget', () => {
        it('sends identity instead of queueing past the budget', async () => {
            const held = holdNextBrotliCompress();
            const first = request('/budget', browserAcceptEncoding);
            await held.started.promise;

            const second = await request('/budget', browserAcceptEncoding);
            expect(second.headers['content-encoding']).toBeUndefined();
            expect(JSON.parse(second.body.toString())).toEqual(largePayload);

            held.release.resolve();
            expect((await first).headers['content-encoding']).toBe('br');

            const third = await request('/budget', browserAcceptEncoding);
            expect(third.headers['content-encoding']).toBe('br');
        });

        it('compresses past the budget when the client refuses identity', async () => {
            const held = holdNextBrotliCompress();
            const first = request('/budget', browserAcceptEncoding);
            await held.started.promise;

            const second = await request('/budget', 'br, identity;q=0');
            expect(second.headers['content-encoding']).toBe('br');
            expect(decodeJson(second)).toEqual(largePayload);

            held.release.resolve();
            expect((await first).headers['content-encoding']).toBe('br');
        });

        it('frees the budget when compression fails', async () => {
            vi.spyOn(zlib, 'brotliCompress').mockImplementationOnce(
                failingEncoder,
            );
            const failed = await request('/budget', browserAcceptEncoding);
            expect(failed.headers['content-encoding']).toBeUndefined();

            const held = holdNextBrotliCompress();
            held.release.resolve();
            const next = await request('/budget', browserAcceptEncoding);
            expect(next.headers['content-encoding']).toBe('br');
            await held.finished.promise;

            const afterThat = await request('/budget', browserAcceptEncoding);
            expect(afterThat.headers['content-encoding']).toBe('br');
        });
    });
});
