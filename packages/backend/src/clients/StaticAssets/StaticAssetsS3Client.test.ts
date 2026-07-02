import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { StaticAssetsS3Client } from './StaticAssetsS3Client';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const s3Mocks = vi.hoisted(() => {
    const send = vi.fn();
    class FakeS3 {
        send = send;
    }
    class FakeCommand {
        constructor(readonly input: Record<string, unknown>) {}
    }
    class FakeNoSuchKey extends Error {}
    class FakeNotFound extends Error {}
    class FakeS3ServiceException extends Error {
        $metadata: { httpStatusCode?: number } = {};
    }
    return {
        send,
        FakeS3,
        FakeCommand,
        FakeNoSuchKey,
        FakeNotFound,
        FakeS3ServiceException,
    };
});

vi.mock('@aws-sdk/client-s3', () => ({
    S3: s3Mocks.FakeS3,
    GetObjectCommand: class extends s3Mocks.FakeCommand {},
    PutObjectCommand: class extends s3Mocks.FakeCommand {},
    NoSuchKey: s3Mocks.FakeNoSuchKey,
    NotFound: s3Mocks.FakeNotFound,
    S3ServiceException: s3Mocks.FakeS3ServiceException,
}));

const configWithAssets: LightdashConfig = {
    ...lightdashConfigMock,
    staticAssets: {
        s3: {
            endpoint: 'https://storage.example.com',
            region: 'us-east-1',
            bucket: 'assets-bucket',
            accessKey: 'access',
            secretKey: 'secret',
        },
        syncEnabled: true,
    },
};

const createClient = (lightdashConfig: LightdashConfig = configWithAssets) =>
    new StaticAssetsS3Client({ lightdashConfig });

const forbiddenError = (statusCode: number) => {
    const error = new s3Mocks.FakeS3ServiceException('denied');
    error.$metadata = { httpStatusCode: statusCode };
    return error;
};

describe('StaticAssetsS3Client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('is disabled and inert without configuration', async () => {
        const client = createClient(lightdashConfigMock);

        expect(client.isEnabled).toBe(false);
        expect(await client.getAsset('chunk.js')).toBeNull();
        await client.syncLocalAssets('/nonexistent/assets');
        expect(s3Mocks.send).not.toHaveBeenCalled();
    });

    describe('getAsset', () => {
        it('fetches the object under the assets/ prefix', async () => {
            const body = Readable.from(['x']);
            s3Mocks.send.mockResolvedValueOnce({
                Body: body,
                ContentLength: 7,
            });

            const asset = await createClient().getAsset('chunk.js');

            expect(asset).toEqual({ body, contentLength: 7 });
            const command = s3Mocks.send.mock.calls[0][0];
            expect(command.input).toEqual({
                Bucket: 'assets-bucket',
                Key: 'assets/chunk.js',
            });
        });

        it('treats NoSuchKey as a silent miss', async () => {
            s3Mocks.send.mockRejectedValueOnce(
                new s3Mocks.FakeNoSuchKey('missing'),
            );

            expect(await createClient().getAsset('chunk.js')).toBeNull();
            expect(Logger.warn).not.toHaveBeenCalled();
            expect(Logger.error).not.toHaveBeenCalled();
        });

        it('treats a 403 (AWS S3 without ListBucket) as a silent miss', async () => {
            s3Mocks.send.mockRejectedValueOnce(forbiddenError(403));

            expect(await createClient().getAsset('chunk.js')).toBeNull();
            expect(Logger.warn).not.toHaveBeenCalled();
        });

        it('logs and returns null on unexpected errors', async () => {
            s3Mocks.send.mockRejectedValueOnce(new Error('socket timeout'));

            expect(await createClient().getAsset('chunk.js')).toBeNull();
            expect(Logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('socket timeout'),
            );
        });
    });

    describe('syncLocalAssets', () => {
        let assetsDir: string;

        beforeEach(async () => {
            assetsDir = await fs.mkdtemp(
                path.join(os.tmpdir(), 'static-assets-test-'),
            );
            await fs.writeFile(path.join(assetsDir, 'index-abc.js'), 'js');
            await fs.writeFile(path.join(assetsDir, 'style.css'), 'css');
            await fs.writeFile(path.join(assetsDir, 'index-abc.js.map'), '{}');
            await fs.writeFile(path.join(assetsDir, 'index-abc.js.gzip'), 'gz');
            await fs.mkdir(path.join(assetsDir, 'fonts'));
            await fs.writeFile(
                path.join(assetsDir, 'fonts', 'inter.woff2'),
                'font',
            );
        });

        afterEach(async () => {
            await fs.rm(assetsDir, { recursive: true, force: true });
        });

        it('uploads assets with content types, skipping .gzip and .map files', async () => {
            s3Mocks.send.mockResolvedValue({});

            await createClient().syncLocalAssets(assetsDir);

            const inputs = s3Mocks.send.mock.calls.map(
                ([command]) => command.input,
            );
            expect(inputs.map((input) => input.Key).sort()).toEqual([
                'assets/fonts/inter.woff2',
                'assets/index-abc.js',
                'assets/style.css',
            ]);
            const jsUpload = inputs.find(
                (input) => input.Key === 'assets/index-abc.js',
            );
            expect(jsUpload).toMatchObject({
                Bucket: 'assets-bucket',
                ContentType: 'application/javascript; charset=UTF-8',
                ContentLength: 2,
                CacheControl: 'public, max-age=31536000, immutable',
            });
            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Uploaded 3/3 static assets'),
            );
        });

        it('never rejects and reports partial upload failures', async () => {
            s3Mocks.send
                .mockRejectedValueOnce(new Error('put failed'))
                .mockResolvedValue({});

            await expect(
                createClient().syncLocalAssets(assetsDir),
            ).resolves.toBeUndefined();

            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringContaining('put failed'),
            );
            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Uploaded 2/3 static assets'),
            );
        });

        it('never rejects when the assets directory is unreadable', async () => {
            await expect(
                createClient().syncLocalAssets('/nonexistent/assets'),
            ).resolves.toBeUndefined();

            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to sync static assets'),
            );
        });
    });
});
