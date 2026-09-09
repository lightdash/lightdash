import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

vi.mock('../../../clients/Aws/S3BaseClient', () => ({
    createS3ClientFromConfig: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

describe('signed analytics file manifests', () => {
    const org = '00000000-0000-0000-0000-000000000001';
    const prefix = `events/compacted/org_id=${org}/`;
    const config = {
        storage: {
            endpoint: 'https://storage.googleapis.com',
            bucket: 'example-bucket',
            region: 'us-east4',
            accessKey: 'writer-access-key',
            secretKey: 'writer-secret',
        },
        organizationUuid: org,
    };
    const key = (stream = 'query_events', date = '2026-09-07') =>
        `${prefix}stream=${stream}/dt=${date}/part-1.parquet`;
    const send = vi.fn();
    const destroy = vi.fn();

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(createS3ClientFromConfig).mockReturnValue({
            send,
            destroy,
        } as unknown as ReturnType<typeof createS3ClientFromConfig>);
        send.mockResolvedValue({ Contents: [{ Key: key() }] });
        vi.mocked(getSignedUrl).mockResolvedValue('signed-url');
    });

    it('uses writer config only for prefix listing and signing exact GETs', async () => {
        const resolve = createS3AnalyticsSourceResolver(config);
        expect(createS3ClientFromConfig).not.toHaveBeenCalled();
        const source = await resolve();
        expect(createS3ClientFromConfig).toHaveBeenCalledWith({
            ...config.storage,
            forcePathStyle: true,
        });
        expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
        expect(send.mock.calls[0][0].input).toMatchObject({
            Bucket: config.storage.bucket,
            Prefix: prefix,
        });
        const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
        expect(command).toBeInstanceOf(GetObjectCommand);
        expect(command.input).toEqual({ Bucket: 'example-bucket', Key: key() });
        expect(options).toEqual({ expiresIn: 900 });
        expect(source).toEqual({
            scope: `https://storage.googleapis.com/example-bucket/events/compacted/org_id%3D${org}/`,
            signedUrls: true,
            tables: [{ name: 'query_events', urls: ['signed-url'] }],
        });
        expect(JSON.stringify(source)).not.toContain('writer-');
        expect(destroy).toHaveBeenCalledOnce();
    });

    it('includes all retained dates across pages, including year-old data, for supported streams only', async () => {
        send.mockResolvedValueOnce({
            Contents: [
                { Key: key('query_events', '2025-09-07') },
                { Key: key('other') },
                { Key: key() },
            ],
            IsTruncated: true,
            NextContinuationToken: 'next',
        }).mockResolvedValueOnce({ Contents: [{ Key: key('ai_usage') }] });
        const source = await createS3AnalyticsSourceResolver(config)();
        expect(source.tables.map(({ name }) => name)).toEqual([
            'query_events',
            'ai_usage',
        ]);
        expect(getSignedUrl).toHaveBeenCalledTimes(3);
        expect(
            vi
                .mocked(getSignedUrl)
                .mock.calls.map(
                    ([, command]) => (command as GetObjectCommand).input.Key,
                ),
        ).toEqual([key('query_events', '2025-09-07'), key(), key('ai_usage')]);
        expect(send.mock.calls[1][0].input.ContinuationToken).toBe('next');
    });

    it('refreshes the manifest and signatures on each query', async () => {
        const resolve = createS3AnalyticsSourceResolver(config);
        await resolve();
        await resolve();
        expect(send).toHaveBeenCalledTimes(2);
        expect(getSignedUrl).toHaveBeenCalledTimes(2);
        expect(destroy).toHaveBeenCalledTimes(2);
    });

    it('fails rather than exposing partial history when the file cap is exceeded', async () => {
        send.mockResolvedValue({
            Contents: Array.from({ length: 1000 }, (_, index) => ({
                Key: `${prefix}stream=query_events/dt=2025-09-07/part-${index}.parquet`,
            })),
            IsTruncated: true,
            NextContinuationToken: 'next',
        });
        await expect(createS3AnalyticsSourceResolver(config)()).rejects.toThrow(
            'Analytics storage access failed',
        );
        expect(getSignedUrl).toHaveBeenCalledTimes(10_000);
        expect(destroy).toHaveBeenCalledOnce();
    });

    it.each([
        { ...config, organizationUuid: '../other' },
        { ...config, organizationUuid: '-'.repeat(36) },
        { ...config, storage: { ...config.storage, bucket: 'bucket/other' } },
        {
            ...config,
            storage: { ...config.storage, endpoint: 'http://remote.test' },
        },
        {
            ...config,
            storage: {
                ...config.storage,
                endpoint: 'https://user:pass@host.test',
            },
        },
    ])('rejects unsafe config before accessing storage', (invalid) => {
        expect(() => createS3AnalyticsSourceResolver(invalid)).toThrow();
        expect(createS3ClientFromConfig).not.toHaveBeenCalled();
    });

    it.each([
        { Contents: [{ Key: 'events/compacted/org_id=other/file.parquet' }] },
        { Contents: [] },
        { Contents: [{ Key: `${prefix}../other/part.parquet` }] },
        { Contents: [], IsTruncated: true },
    ])('fails closed on invalid or empty manifests', async (response) => {
        send.mockResolvedValue(response);
        await expect(createS3AnalyticsSourceResolver(config)()).rejects.toThrow(
            'Analytics storage access failed',
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledOnce();
    });

    it('sanitizes SDK errors without falling back to bucket credentials', async () => {
        send.mockRejectedValue(
            new Error('writer-secret and X-Amz-Signature=secret'),
        );
        await expect(createS3AnalyticsSourceResolver(config)()).rejects.toThrow(
            /^Analytics storage access failed\. Check bucket credentials, organization and compacted data availability\.$/,
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledOnce();
    });
});
