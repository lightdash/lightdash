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

const createRequest = (assetPath: string): Request =>
    ({ params: { 0: assetPath } }) as unknown as Request;

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
    client: ClientStub,
    req: Request,
    res: Response,
    next: NextFunction,
) =>
    createStaticAssetsFallbackHandler(
        client as unknown as StaticAssetsS3Client,
    )(req, res, next);

describe('isSafeAssetPath', () => {
    it('accepts hashed chunk filenames and nested paths', () => {
        expect(isSafeAssetPath('index-DhQ0k3aF.js')).toBe(true);
        expect(isSafeAssetPath('fonts/inter-Bold.woff2')).toBe(true);
    });

    it('rejects traversal and empty segments', () => {
        expect(isSafeAssetPath('../secrets.env')).toBe(false);
        expect(isSafeAssetPath('foo/../../etc/passwd')).toBe(false);
        expect(isSafeAssetPath('..%2Fsecrets.env')).toBe(false);
        expect(isSafeAssetPath('foo//bar.js')).toBe(false);
        expect(isSafeAssetPath('.')).toBe(false);
        expect(isSafeAssetPath('foo bar.js')).toBe(false);
        expect(isSafeAssetPath('foo\\bar.js')).toBe(false);
        expect(isSafeAssetPath('foo\0.js')).toBe(false);
    });
});

describe('createStaticAssetsFallbackHandler', () => {
    it('falls through when the client is not configured', async () => {
        const client = createClientStub({ isEnabled: false });
        const next = vi.fn();

        await runHandler(
            client,
            createRequest('chunk.js'),
            createResponse(),
            next,
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(client.getAsset).not.toHaveBeenCalled();
    });

    it('falls through without hitting the bucket for unsafe paths', async () => {
        const client = createClientStub();
        const next = vi.fn();

        await runHandler(
            client,
            createRequest('../index.html'),
            createResponse(),
            next,
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(client.getAsset).not.toHaveBeenCalled();
    });

    it('falls through when the bucket does not have the asset', async () => {
        const client = createClientStub();
        const next = vi.fn();

        await runHandler(
            client,
            createRequest('chunk.js'),
            createResponse(),
            next,
        );

        expect(client.getAsset).toHaveBeenCalledWith('chunk.js');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('streams a bucket hit with immutable caching headers', async () => {
        const asset: StaticAsset = {
            body: Readable.from(['chunk contents']),
            contentType: 'text/javascript; charset=utf-8',
            contentLength: 123,
        };
        const client = createClientStub({
            getAsset: vi.fn().mockResolvedValue(asset),
        });
        const res = createWritableResponse();
        const next = vi.fn();

        await runHandler(
            client,
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
            'text/javascript; charset=utf-8',
        );
        expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 123);
        expect(res.writtenBody()).toBe('chunk contents');
    });

    it('ends the response with a 500 when the stream errors before any data', async () => {
        const asset: StaticAsset = {
            body: new Readable({
                read() {
                    this.destroy(new Error('connection reset'));
                },
            }),
            contentType: 'text/javascript; charset=utf-8',
            contentLength: 123,
        };
        const client = createClientStub({
            getAsset: vi.fn().mockResolvedValue(asset),
        });
        const res = createWritableResponse();
        const next = vi.fn();

        await runHandler(
            client,
            createRequest('chunk.js'),
            res as unknown as Response,
            next,
        );
        await new Promise((resolve) => {
            res.on('close', resolve);
        });

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
    });
});
