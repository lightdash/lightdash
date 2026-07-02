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

    // "No bucket configured → no-op" is pinned at the config layer
    // (parseConfig.test.ts) and the middleware layer (isEnabled gate);
    // this file only covers the configured client.
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

        it('degrades to a fast miss when the bucket exceeds the 5s time-box', async () => {
            // A slow bucket must produce a 404, not hang every /assets
            // request behind SDK retries.
            vi.useFakeTimers();
            try {
                s3Mocks.send.mockImplementationOnce(
                    (
                        _command: unknown,
                        options: { abortSignal: AbortSignal },
                    ) =>
                        new Promise((_resolve, reject) => {
                            options.abortSignal.addEventListener('abort', () =>
                                reject(new Error('Request aborted')),
                            );
                        }),
                );

                const assetPromise = createClient().getAsset('chunk.js');
                await vi.advanceTimersByTimeAsync(5_000);

                expect(await assetPromise).toBeNull();
                expect(Logger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('aborted'),
                );
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
