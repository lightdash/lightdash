import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    S3,
    UploadPartCommand,
} from '@aws-sdk/client-s3';
import { uploadUsageParquet } from './uploadUsageParquet';

it('cancels the underlying SDK request and waits for it to settle', async () => {
    const client = new S3({
        region: 'us-east-1',
        endpoint: 'http://localhost:1',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const controller = new AbortController();
    let finishRequest!: () => void;
    let observedAbort = false;
    const send = vi.spyOn(client, 'send').mockImplementation(
        (_command, options) =>
            new Promise((_resolve, reject) => {
                const signal = (options as { abortSignal: AbortSignal })
                    .abortSignal;
                signal.addEventListener('abort', () => {
                    observedAbort = true;
                });
                finishRequest = () => reject(new Error('request canceled'));
            }),
    );
    const uploading = uploadUsageParquet(
        {
            client,
            params: {
                Bucket: 'test',
                Key: 'result.parquet',
                Body: Buffer.from('test'),
            },
        },
        controller.signal,
    );
    let finished = false;
    const outcome = uploading
        .catch((error: unknown) => error)
        .finally(() => {
            finished = true;
        });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    controller.abort();
    expect(observedAbort).toBe(true);
    await Promise.resolve();
    expect(finished).toBe(false);
    finishRequest();
    expect(await outcome).toBeInstanceOf(Error);
    client.destroy();
});

it('cleans up a multipart upload canceled during completion', async () => {
    const client = new S3({
        region: 'us-east-1',
        endpoint: 'http://localhost:1',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const controller = new AbortController();
    const send = vi
        .spyOn(client, 'send')
        .mockImplementation(async (command) => {
            if (command instanceof CreateMultipartUploadCommand)
                return { UploadId: 'upload-test' };
            if (command instanceof UploadPartCommand) return { ETag: 'part' };
            if (command instanceof CompleteMultipartUploadCommand) {
                controller.abort(new Error('lease lost'));
                throw new Error('completion canceled');
            }
            if (command instanceof AbortMultipartUploadCommand) return {};
            throw new Error('unexpected SDK request');
        });
    await expect(
        uploadUsageParquet(
            {
                client,
                queueSize: 1,
                partSize: 5 * 1024 * 1024,
                params: {
                    Bucket: 'test',
                    Key: 'result.parquet',
                    Body: Buffer.alloc(5 * 1024 * 1024 + 1),
                },
            },
            controller.signal,
        ),
    ).rejects.toThrow('completion canceled');
    expect(send).toHaveBeenLastCalledWith(
        expect.any(AbortMultipartUploadCommand),
        expect.objectContaining({
            requestTimeout: 10_000,
            abortSignal: expect.any(AbortSignal),
        }),
    );
    client.destroy();
});
