import type { NextFunction, Request, Response } from 'express';
import { Readable, Writable } from 'stream';
import {
    createStaticAssetsFallbackHandler,
    isSafeAssetPath,
} from './staticAssetsFallbackMiddleware';
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
    ({ setHeader: vi.fn() }) as unknown as Response;

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

// The accept path of isSafeAssetPath is exercised by every handler test
// below that reaches the bucket (they run the real predicate, unmocked).
describe('isSafeAssetPath', () => {
    it('rejects traversal, empty segments, and oversized paths', () => {
        expect(isSafeAssetPath('../secrets.env')).toBe(false);
        expect(isSafeAssetPath('foo/../../etc/passwd')).toBe(false);
        expect(isSafeAssetPath('..%2Fsecrets.env')).toBe(false);
        expect(isSafeAssetPath('foo//bar.js')).toBe(false);
        expect(isSafeAssetPath('.')).toBe(false);
        expect(isSafeAssetPath('foo bar.js')).toBe(false);
        expect(isSafeAssetPath('foo\\bar.js')).toBe(false);
        expect(isSafeAssetPath('foo\0.js')).toBe(false);
        expect(isSafeAssetPath(`${'a'.repeat(600)}.js`)).toBe(false);
    });
});

describe('createStaticAssetsFallbackHandler', () => {
    it('falls through without a bucket round-trip when disabled, path is unsafe, or extension is unknown', async () => {
        // All three gates must fall through to the 404 handler without a
        // billed bucket GET.
        const cases: Array<{ client: ClientStub; assetPath: string }> = [
            {
                client: createClientStub({ isEnabled: false }),
                assetPath: 'chunk.js',
            },
            { client: createClientStub(), assetPath: '../index.html' },
            { client: createClientStub(), assetPath: 'probe.zzz9' },
        ];

        for (const { client, assetPath } of cases) {
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
    });

    it('falls through when the bucket does not have the asset', async () => {
        const client = createClientStub();
        const next = vi.fn();

        await runHandler(
            createHandler(client),
            createRequest('chunk.js'),
            createResponse(),
            next,
        );

        expect(client.getAsset).toHaveBeenCalledWith('chunk.js');
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
});
