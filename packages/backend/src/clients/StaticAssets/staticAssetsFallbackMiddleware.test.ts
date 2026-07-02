import type { NextFunction, Request, Response } from 'express';
import {
    createStaticAssetsFallbackHandler,
    isSafeAssetPath,
} from './staticAssetsFallbackMiddleware';
import type { StaticAsset, StaticAssetsS3Client } from './StaticAssetsS3Client';

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
        expect(isSafeAssetPath('foo//bar.js')).toBe(false);
        expect(isSafeAssetPath('.')).toBe(false);
        expect(isSafeAssetPath('foo bar.js')).toBe(false);
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
            body: { pipe: vi.fn() } as unknown as StaticAsset['body'],
            contentType: 'text/javascript; charset=utf-8',
            contentLength: 123,
        };
        const client = createClientStub({
            getAsset: vi.fn().mockResolvedValue(asset),
        });
        const res = createResponse();
        const next = vi.fn();

        await runHandler(client, createRequest('chunk.js'), res, next);

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
        expect(asset.body.pipe).toHaveBeenCalledWith(res);
    });
});
