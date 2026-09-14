import type { NextFunction, Request, Response } from 'express';
import { Readable, Writable } from 'stream';
import { createStaticAssetsFallbackHandler } from './staticAssetsFallbackMiddleware';
import type { StaticAsset, StaticAssetsS3Client } from './StaticAssetsS3Client';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

type ClientStub = {
    isEnabled: boolean;
    getAsset: ReturnType<typeof vi.fn>;
};

const createClientStub = (overrides?: Partial<ClientStub>): ClientStub => ({
    isEnabled: true,
    getAsset: vi.fn().mockResolvedValue(null),
    ...overrides,
});

const createRequest = (assetPath: string, method = 'GET'): Request =>
    ({ params: { 0: assetPath }, method }) as unknown as Request;

const createResponse = (): Response =>
    ({ setHeader: vi.fn(), once: vi.fn() }) as unknown as Response;

type WritableResponse = Writable & {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    headersSent: boolean;
    writtenBody: () => string;
};

const createWritableResponse = (): WritableResponse => {
    const chunks: Buffer[] = [];
    const res = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        },
    }) as WritableResponse;
    res.setHeader = vi.fn();
    res.status = vi.fn(() => res);
    res.headersSent = false;
    res.writtenBody = () => Buffer.concat(chunks).toString();
    return res;
};

const runHandler = async (
    handler: ReturnType<typeof createStaticAssetsFallbackHandler>,
    req: Request,
    res: Response,
    next: NextFunction,
) => handler(req, res, next);

const createHandler = (client: ClientStub) =>
    createStaticAssetsFallbackHandler(
        client as unknown as StaticAssetsS3Client,
    );

describe('createStaticAssetsFallbackHandler', () => {
    it('falls through to the 404 on every non-hit: disabled, unsafe path, unknown extension, bucket miss', async () => {
        // The safety contract: whatever happens, /assets behavior degrades
        // to today's 404 — and the three gates never cost a bucket GET.
        // (Unsafe paths run the real isSafeAssetPath predicate.)
        const gatedCases: Array<{ client: ClientStub; assetPath: string }> = [
            {
                client: createClientStub({ isEnabled: false }),
                assetPath: 'chunk.js',
            },
            { client: createClientStub(), assetPath: '../index.html' },
            { client: createClientStub(), assetPath: 'foo/../../etc/passwd' },
            {
                client: createClientStub(),
                assetPath: `${'a'.repeat(600)}.js`,
            },
            { client: createClientStub(), assetPath: 'probe.zzz9' },
        ];

        for (const { client, assetPath } of gatedCases) {
            const next = vi.fn();
            // eslint-disable-next-line no-await-in-loop
            await runHandler(
                createHandler(client),
                createRequest(assetPath),
                createResponse(),
                next,
            );
            expect(next).toHaveBeenCalledTimes(1);
            expect(client.getAsset).not.toHaveBeenCalled();
        }

        // Safe path but the bucket doesn't have it: one GET, then the 404
        const missClient = createClientStub();
        const next = vi.fn();
        await runHandler(
            createHandler(missClient),
            createRequest('chunk.js'),
            createResponse(),
            next,
        );
        expect(missClient.getAsset).toHaveBeenCalledWith('chunk.js');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('caches a miss within the TTL and re-hits the bucket once it lapses', async () => {
        // Both halves of the negative-cache contract: repeated misses cost
        // one bucket GET (probe protection), and expiry recovers — if it
        // ever broke, a pod that missed a chunk once would 404 it forever,
        // even after a release uploads it.
        vi.useFakeTimers();
        try {
            const client = createClientStub();
            const handler = createHandler(client);
            const next = vi.fn();

            await runHandler(
                handler,
                createRequest('chunk.js'),
                createResponse(),
                next,
            );
            await runHandler(
                handler,
                createRequest('chunk.js'),
                createResponse(),
                next,
            );
            expect(client.getAsset).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledTimes(2);

            vi.advanceTimersByTime(61_000);

            await runHandler(
                handler,
                createRequest('chunk.js'),
                createResponse(),
                next,
            );
            expect(client.getAsset).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('serves a bucket hit: streamed GET with immutable headers, no Content-Length when unknown, headers-only HEAD', async () => {
        const asset: StaticAsset = {
            body: Readable.from(['chunk contents']),
            contentLength: 123,
        };
        const client = createClientStub({
            getAsset: vi.fn().mockResolvedValue(asset),
        });
        const res = createWritableResponse();
        const next = vi.fn();

        await runHandler(
            createHandler(client),
            createRequest('chunk.js'),
            res as unknown as Response,
            next,
        );
        await new Promise((resolve) => {
            res.on('finish', resolve);
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'public, max-age=31536000, immutable',
        );
        expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Type',
            'application/javascript; charset=UTF-8',
        );
        expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 123);
        expect(res.writtenBody()).toBe('chunk contents');

        // Same path with an unknown length: header omitted, not sent as 0
        const noLengthClient = createClientStub({
            getAsset: vi.fn().mockResolvedValue({
                body: Readable.from(['x']),
                contentLength: undefined,
            } satisfies StaticAsset),
        });
        const noLengthRes = createWritableResponse();
        await runHandler(
            createHandler(noLengthClient),
            createRequest('other.js'),
            noLengthRes as unknown as Response,
            vi.fn(),
        );
        await new Promise((resolve) => {
            noLengthRes.on('finish', resolve);
        });
        expect(noLengthRes.setHeader).not.toHaveBeenCalledWith(
            'Content-Length',
            expect.anything(),
        );

        // HEAD (express routes it to GET handlers): headers only, and the
        // bucket stream must be destroyed, not leaked
        const headBody = Readable.from(['chunk contents']);
        const headClient = createClientStub({
            getAsset: vi.fn().mockResolvedValue({
                body: headBody,
                contentLength: 123,
            } satisfies StaticAsset),
        });
        const headRes = createWritableResponse();
        await runHandler(
            createHandler(headClient),
            createRequest('chunk.js', 'HEAD'),
            headRes as unknown as Response,
            vi.fn(),
        );
        await new Promise((resolve) => {
            headRes.on('finish', resolve);
        });
        expect(headRes.setHeader).toHaveBeenCalledWith('Content-Length', 123);
        expect(headRes.writtenBody()).toBe('');
        expect(headBody.destroyed).toBe(true);
    });

    it('tears the response down without a late status write when the stream errors', async () => {
        const asset: StaticAsset = {
            body: new Readable({
                read() {
                    this.destroy(new Error('connection reset'));
                },
            }),
            contentLength: 123,
        };
        const client = createClientStub({
            getAsset: vi.fn().mockResolvedValue(asset),
        });
        const res = createWritableResponse();
        const next = vi.fn();

        await runHandler(
            createHandler(client),
            createRequest('chunk.js'),
            res as unknown as Response,
            next,
        );
        await new Promise((resolve) => {
            res.on('close', resolve);
        });

        expect(res.destroyed).toBe(true);
        expect(res.status).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
    it('retries immediately after a transient storage failure', async () => {
        const client = createClientStub();
        client.getAsset.mockRejectedValueOnce(new Error('temporary timeout'));
        const handler = createHandler(client);
        const next = vi.fn();
        await runHandler(
            handler,
            createRequest('chunk.js'),
            createResponse(),
            next,
        );
        await runHandler(
            handler,
            createRequest('chunk.js'),
            createResponse(),
            next,
        );
        expect(client.getAsset).toHaveBeenCalledTimes(2);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it('holds capacity for disconnected upstream reads until they settle', async () => {
        let rejectFetch: (reason: Error) => void = () => {};
        const pending = new Promise<null>((_resolve, reject) => {
            rejectFetch = reject;
        });
        const client = createClientStub({
            getAsset: vi.fn().mockReturnValue(pending),
        });
        const handler = createHandler(client);
        const responses = Array.from({ length: 128 }, createWritableResponse);
        const requests = responses.map((response, index) =>
            runHandler(
                handler,
                createRequest(`chunk-${index}.js`),
                response as unknown as Response,
                vi.fn(),
            ),
        );
        responses.forEach((response) => response.destroy());
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        const res = createWritableResponse();
        await runHandler(
            handler,
            createRequest('overflow.js'),
            res as unknown as Response,
            vi.fn(),
        );
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(client.getAsset).toHaveBeenCalledTimes(128);
        rejectFetch(new Error('temporary'));
        await Promise.all(requests);
        client.getAsset.mockResolvedValue(null);
        await runHandler(
            handler,
            createRequest('recovered.js'),
            createResponse(),
            vi.fn(),
        );
        expect(client.getAsset).toHaveBeenCalledTimes(129);
    });

    it('serves a burst of 128 retained chunks and more than 600 hits per minute', async () => {
        const client = createClientStub({
            getAsset: vi.fn().mockImplementation(
                async () =>
                    ({
                        body: Readable.from(['export const retained = true;']),
                        contentLength: undefined,
                    }) satisfies StaticAsset,
            ),
        });
        const handler = createHandler(client);
        for (let batch = 0; batch < 6; batch += 1) {
            // Each batch represents multiple stale tabs loading chunks concurrently.
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(
                Array.from({ length: 128 }, async (_, index) => {
                    const res = createWritableResponse();
                    const finished = new Promise<void>((resolve, reject) => {
                        res.once('close', resolve);
                        res.once('error', reject);
                    });
                    const next = vi.fn();
                    await runHandler(
                        handler,
                        createRequest(`chunk-${index}.js`),
                        res as unknown as Response,
                        next,
                    );
                    await finished;
                    expect(res.status).not.toHaveBeenCalled();
                    expect(next).not.toHaveBeenCalled();
                    expect(res.writtenBody()).toBe(
                        'export const retained = true;',
                    );
                }),
            );
        }
        expect(client.getAsset).toHaveBeenCalledTimes(768);
    });
});
