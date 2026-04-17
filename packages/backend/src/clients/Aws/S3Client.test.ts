import {
    HeadObjectCommand,
    NoSuchKey,
    NotFound,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { MissingConfigError } from '@lightdash/common';
import { S3Client } from './S3Client';

describe('S3Client', () => {
    const baseConfig = {
        s3: {
            bucket: 'test-bucket',
            region: 'us-east-1',
            endpoint: 'http://localhost:9000',
            accessKey: 'test-access',
            secretKey: 'test-secret',
            forcePathStyle: true,
        },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createClient = (sendImpl: (...args: any[]) => any) => {
        const client = new S3Client({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            lightdashConfig: baseConfig as any,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client as any).s3 = { send: sendImpl };
        return client;
    };

    const createUnconfiguredClient = () =>
        new S3Client({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            lightdashConfig: { s3: undefined } as any,
        });

    describe('objectExists', () => {
        it('returns true when HeadObjectCommand succeeds', async () => {
            const send = jest.fn(async (_: unknown) => ({}));
            const client = createClient(send);

            await expect(client.objectExists('foo.png')).resolves.toBe(true);

            expect(send).toHaveBeenCalledTimes(1);
            const command = send.mock.calls[0][0];
            expect(command).toBeInstanceOf(HeadObjectCommand);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((command as any).input).toEqual({
                Bucket: 'test-bucket',
                Key: 'foo.png',
            });
        });

        it('returns false when the SDK throws NotFound', async () => {
            const notFound = new NotFound({
                message: 'Not Found',
                $metadata: {},
            });
            const client = createClient(
                jest.fn(async (_: unknown) => {
                    throw notFound;
                }),
            );

            await expect(client.objectExists('missing.png')).resolves.toBe(
                false,
            );
        });

        it('returns false when the SDK throws NoSuchKey', async () => {
            const noSuchKey = new NoSuchKey({
                message: 'The specified key does not exist.',
                $metadata: {},
            });
            const client = createClient(
                jest.fn(async (_: unknown) => {
                    throw noSuchKey;
                }),
            );

            await expect(client.objectExists('expired.png')).resolves.toBe(
                false,
            );
        });

        it('re-throws a generic S3ServiceException (e.g. access denied)', async () => {
            const forbidden = new S3ServiceException({
                name: 'AccessDenied',
                $fault: 'client',
                $metadata: { httpStatusCode: 403 },
                message: 'Access Denied',
            });
            const client = createClient(
                jest.fn(async (_: unknown) => {
                    throw forbidden;
                }),
            );

            await expect(client.objectExists('acl-locked.png')).rejects.toBe(
                forbidden,
            );
        });

        it('re-throws a plain network Error', async () => {
            const networkError = new Error('ENOTFOUND storage.example.com');
            const client = createClient(
                jest.fn(async (_: unknown) => {
                    throw networkError;
                }),
            );

            await expect(client.objectExists('outage.png')).rejects.toBe(
                networkError,
            );
        });

        it('throws MissingConfigError when the bucket is not configured', async () => {
            const client = createUnconfiguredClient();

            await expect(client.objectExists('any.png')).rejects.toThrow(
                MissingConfigError,
            );
        });
    });
});
