import { S3Client } from '@aws-sdk/client-s3';
import {
    createObjectUrlSigner,
    GcsUrlSigner,
    S3PresignerUrlSigner,
} from './ObjectUrlSigner';

const signerMocks = vi.hoisted(() => ({
    getSignedUrl: vi.fn(async () => 'https://s3.example.com/signed'),
    getGcsSignedUrl: vi.fn(async (_options: Record<string, unknown>) => [
        'https://storage.googleapis.com/signed',
    ]),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: signerMocks.getSignedUrl,
}));

vi.mock('@google-cloud/storage', () => ({
    Storage: class {
        // eslint-disable-next-line class-methods-use-this
        bucket(bucketName: string) {
            return {
                file: (key: string) => ({
                    getSignedUrl: (options: Record<string, unknown>) =>
                        signerMocks.getGcsSignedUrl({
                            bucketName,
                            key,
                            ...options,
                        }),
                }),
            };
        }
    },
}));

const fakeClient = {} as S3Client;

describe('ObjectUrlSigner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the AWS presigner in default mode', () => {
        expect(createObjectUrlSigner(fakeClient, {})).toBeInstanceOf(
            S3PresignerUrlSigner,
        );
        expect(
            createObjectUrlSigner(fakeClient, { authMode: 'default' }),
        ).toBeInstanceOf(S3PresignerUrlSigner);
    });

    it('returns the Google signer in gcp_oauth mode', () => {
        expect(
            createObjectUrlSigner(fakeClient, { authMode: 'gcp_oauth' }),
        ).toBeInstanceOf(GcsUrlSigner);
    });

    it('passes the expiry through to the AWS presigner', async () => {
        const url = await new S3PresignerUrlSigner(
            fakeClient,
        ).getSignedDownloadUrl('a-bucket', 'a-key', 60);

        expect(url).toEqual('https://s3.example.com/signed');
        expect(signerMocks.getSignedUrl).toHaveBeenCalledWith(
            fakeClient,
            expect.objectContaining({
                input: { Bucket: 'a-bucket', Key: 'a-key' },
            }),
            { expiresIn: 60 },
        );
    });

    it('signs uploads without the empty-body checksum the SDK adds', async () => {
        const actual = await vi.importActual<
            typeof import('@aws-sdk/s3-request-presigner')
        >('@aws-sdk/s3-request-presigner');
        signerMocks.getSignedUrl.mockImplementationOnce(
            actual.getSignedUrl as never,
        );
        const client = new S3Client({
            region: 'auto',
            endpoint: 'https://storage.example.com',
            forcePathStyle: true,
            credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
        });

        const url = new URL(
            await new S3PresignerUrlSigner(client).getSignedUploadUrl(
                'a-bucket',
                'a-key',
                'application/jsonl',
                60,
            ),
        );

        expect(url.pathname).toEqual('/a-bucket/a-key');
        expect(url.searchParams.get('x-id')).toEqual('PutObject');
        expect(
            [...url.searchParams.keys()].filter((key) => /checksum/i.test(key)),
        ).toEqual([]);
    });

    it('asks Google for a v4 URL', async () => {
        // The library defaults to the obsolete v2 algorithm and reports no
        // error when it creates a v2 URL, so the caller must set the version
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
        const url = await new GcsUrlSigner().getSignedDownloadUrl(
            'a-bucket',
            'a-key',
            60,
        );

        expect(url).toEqual('https://storage.googleapis.com/signed');
        expect(signerMocks.getGcsSignedUrl).toHaveBeenCalledWith({
            bucketName: 'a-bucket',
            key: 'a-key',
            version: 'v4',
            action: 'read',
            expires: new Date('2026-09-15T00:01:00.000Z').getTime(),
        });
    });
});
