import { PassThrough } from 'stream';
import type { LightdashConfig } from '../../config/parseConfig';
import { ChecksumStreamStandIn } from '../Aws/s3Streams.testUtils';
import { NotFound } from '@aws-sdk/client-s3';
import { S3ResultsFileStorageClient } from './S3ResultsFileStorageClient';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const s3Mocks = vi.hoisted(() => {
    const send = vi.fn();
    class FakeS3 {
        middlewareStack = { add: vi.fn() };

        send = send;
    }
    return { send, FakeS3 };
});

vi.mock('@aws-sdk/client-s3', () => {
    class Command {
        constructor(readonly input: Record<string, unknown>) {}
    }
    return {
        S3: s3Mocks.FakeS3,
        S3Client: s3Mocks.FakeS3,
        GetObjectCommand: class GetObjectCommand extends Command {},
        HeadObjectCommand: class HeadObjectCommand extends Command {},
        DeleteObjectCommand: class DeleteObjectCommand extends Command {},
        PutObjectCommand: class PutObjectCommand extends Command {},
        NoSuchKey: class extends Error {},
        NotFound: class extends Error {},
        S3ServiceException: class extends Error {},
    };
});

describe('S3ResultsFileStorageClient', () => {
    const lightdashConfig = {
        s3: { expirationTime: 60 },
        results: {
            s3: {
                bucket: 'results',
                endpoint: 'https://s3.example.com',
                region: 'us-east-1',
            },
        },
    } as unknown as LightdashConfig;

    beforeEach(() => {
        s3Mocks.send.mockReset();
    });

    describe('getFirstLine', () => {
        it('closes the HTTP response behind a checksum-wrapped body after reading the first line', async () => {
            // More than one line and no end, like a large results file
            // served by AWS S3 with a checksum header
            const response = new PassThrough();
            const body = new ChecksumStreamStandIn(response);
            response.write('{"first":true}\n{"second":true}\n');
            s3Mocks.send.mockResolvedValue({ Body: body });
            const client = new S3ResultsFileStorageClient({ lightdashConfig });

            const firstLine = await client.getFirstLine('query-results');

            expect(firstLine).toEqual('{"first":true}');
            expect(response.destroyed).toBe(true);
        });
    });

    describe('stored results page objects', () => {
        const flush = () =>
            new Promise<void>((resolve) => {
                setImmediate(resolve);
            });

        it('reads a whole object with its metadata', async () => {
            const response = new PassThrough();
            response.end('stored bytes');
            s3Mocks.send.mockResolvedValue({
                Body: new ChecksumStreamStandIn(response),
                Metadata: { 'row-count': '3' },
            });
            const client = new S3ResultsFileStorageClient({ lightdashConfig });
            const controller = new AbortController();

            const object = await client.getObjectBytesIfExists('page-key', {
                abortSignal: controller.signal,
            });

            expect(object?.body.toString()).toBe('stored bytes');
            expect(object?.metadata).toEqual({ 'row-count': '3' });
            expect(s3Mocks.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: { Bucket: 'results', Key: 'page-key' },
                }),
                { abortSignal: controller.signal },
            );
        });

        it('stops a read that stalls before the response arrives', async () => {
            s3Mocks.send.mockReturnValue(new Promise(() => {}));
            const client = new S3ResultsFileStorageClient({ lightdashConfig });
            const controller = new AbortController();

            const read = client.getObjectBytesIfExists('page-key', {
                abortSignal: controller.signal,
            });
            await flush();
            controller.abort(new Error('stored page read timed out'));

            await expect(read).rejects.toThrow('stored page read timed out');
        });

        it('stops a read that stalls in the body and frees its socket', async () => {
            const response = new PassThrough();
            response.write('partial');
            s3Mocks.send.mockResolvedValue({
                Body: new ChecksumStreamStandIn(response),
                Metadata: {},
            });
            const client = new S3ResultsFileStorageClient({ lightdashConfig });
            const controller = new AbortController();

            const read = client.getObjectBytesIfExists('page-key', {
                abortSignal: controller.signal,
            });
            await flush();
            controller.abort(new Error('stored page read timed out'));

            await expect(read).rejects.toThrow('stored page read timed out');
            expect(response.destroyed).toBe(true);
        });

        it('stops an upload that stalls', async () => {
            s3Mocks.send.mockReturnValue(new Promise(() => {}));
            const client = new S3ResultsFileStorageClient({ lightdashConfig });
            const controller = new AbortController();

            const upload = client.putObjectBytes(
                'page-key',
                Buffer.from('x'),
                { 'row-count': '1' },
                { abortSignal: controller.signal },
            );
            await flush();
            controller.abort(new Error('stored page upload timed out'));

            await expect(upload).rejects.toThrow(
                'stored page upload timed out',
            );
            expect(s3Mocks.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({ Key: 'page-key' }),
                }),
                { abortSignal: controller.signal },
            );
        });

        it('checks that a results file exists with a HEAD request', async () => {
            s3Mocks.send.mockResolvedValueOnce({ ContentLength: 10 });
            s3Mocks.send.mockRejectedValueOnce(new NotFound({} as never));
            const client = new S3ResultsFileStorageClient({ lightdashConfig });
            const controller = new AbortController();

            await expect(
                client.resultsFileExists('cache-key-abc123', {
                    abortSignal: controller.signal,
                }),
            ).resolves.toBe(true);
            await expect(
                client.resultsFileExists('cache-key-abc123'),
            ).resolves.toBe(false);
            expect(s3Mocks.send).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({
                    input: { Bucket: 'results', Key: 'cache-key-abc123.jsonl' },
                }),
                { abortSignal: controller.signal },
            );
        });

        it('passes the abort signal to the results file download', async () => {
            const response = new PassThrough();
            s3Mocks.send.mockResolvedValue({ Body: response });
            const client = new S3ResultsFileStorageClient({ lightdashConfig });
            const controller = new AbortController();

            await client.getDownloadStream('cache-key-abc123', 'jsonl', {
                abortSignal: controller.signal,
            });

            expect(s3Mocks.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: {
                        Bucket: 'results',
                        Key: 'cache-key-abc123.jsonl',
                    },
                }),
                { abortSignal: controller.signal },
            );
        });
    });
});
