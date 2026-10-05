import { HeadObjectCommand, S3, S3Client } from '@aws-sdk/client-s3';
import { HttpResponse } from '@smithy/protocol-http';
import { createHash } from 'crypto';
import { writeFile } from 'fs/promises';
import { applyGcpOAuth } from '../../clients/Aws/gcpOAuth';
import { buildS3ClientConfig } from '../../clients/Aws/S3BaseClient';
import {
    UsageUserActivityBuilder,
    validateUserActivityRange,
} from './UsageUserActivityBuilder';

const upload = vi.hoisted(() => vi.fn());
const uploadConstructor = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
    GoogleAuth: class {
        async getClient() {
            return { getAccessToken: async () => 'test-access-token' };
        }
    },
}));
vi.mock('@aws-sdk/lib-storage', () => ({
    Upload: class {
        constructor(options: unknown) {
            uploadConstructor(options);
        }
        done = upload;
    },
}));

const org = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-02-01T00:00:00Z');
const storage = {
    endpoint: 'http://localhost:9000',
    bucket: 'test',
    region: 'us-east-1',
    accessKey: 'test',
    secretKey: 'test',
    forcePathStyle: true,
};

describe('user activity safeguards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(S3.prototype, 'headObject').mockRejectedValue({
            $metadata: { httpStatusCode: 404 },
        });
    });
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ['../org', '2026-01-01', '2026-01-01'],
        [org, '2026-02-30', '2026-02-30'],
        [org, '2026-01-02', '2026-01-01'],
        [org, '2025-12-01', '2026-01-31'],
        [org, '2026-02-01', '2026-02-01'],
        [org, "2026-01-01' OR true", '2026-01-01'],
    ])(
        'rejects unsafe range %s %s %s before storage access',
        (id, from, to) => {
            expect(() =>
                validateUserActivityRange(id, from, to, now),
            ).toThrow();
        },
    );

    it('includes each closed UTC date across month boundaries', () => {
        expect(
            validateUserActivityRange(org, '2025-12-31', '2026-01-02', now),
        ).toEqual(['2025-12-31', '2026-01-01', '2026-01-02']);
    });

    it('reports unvisited partitions when the work limit is reached', async () => {
        vi.spyOn(S3.prototype, 'listObjectsV2').mockImplementation(
            async (input) => {
                if (input.Prefix === 'events/compacted/')
                    return {
                        Contents: Array.from({ length: 501 }, (_, index) => ({
                            Key: `events/compacted/org_id=${org}/stream=query_events/dt=${new Date(Date.UTC(2023, 0, index + 1)).toISOString().slice(0, 10)}/part.parquet`,
                        })),
                    };
                throw new Error('storage unavailable');
            },
        );
        const summary = await new UsageUserActivityBuilder(storage, {
            runSqlWithMetrics: vi.fn(),
        }).runAll(now);
        expect(summary).toMatchObject({ failed: 500, limitReached: true });
    });

    it('uses one inventory request for an empty deployment, without per-organization probes', async () => {
        const list = vi
            .spyOn(S3.prototype, 'listObjectsV2')
            .mockResolvedValue({ Contents: [] } as never);
        const runSqlWithMetrics = vi.fn();
        expect(
            await new UsageUserActivityBuilder(storage, {
                runSqlWithMetrics,
            }).runAll(now),
        ).toMatchObject({ published: 0, failed: 0 });
        expect(list).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                Prefix: 'events/compacted/',
                MaxKeys: 1000,
            }),
        );
        expect(runSqlWithMetrics).not.toHaveBeenCalled();
    });

    it('streams inventory pages and processes each closed event partition once across page boundaries', async () => {
        const prefix = `events/compacted/org_id=${org}/`;
        const partition = `${prefix}stream=query_events/dt=2026-01-01/`;
        const list = vi
            .spyOn(S3.prototype, 'listObjectsV2')
            .mockImplementation(
                async (input: {
                    Prefix?: string;
                    ContinuationToken?: string;
                }) => {
                    if (input.Prefix !== 'events/compacted/')
                        return { Contents: [] } as never;
                    if (!input.ContinuationToken)
                        return {
                            Contents: [
                                { Key: `${prefix}dim=users/users.parquet` },
                                {
                                    Key: `${prefix}model=user_activity/stream=query_events/dt=2026-01-01/activity.parquet`,
                                },
                                { Key: `${partition}a.parquet` },
                            ],
                            IsTruncated: true,
                            NextContinuationToken: 'page2',
                        } as never;
                    return {
                        Contents: [
                            { Key: `${partition}b.parquet` },
                            {
                                Key: `${prefix}stream=query_events/dt=2026-01-02/a.parquet`,
                            },
                            {
                                Key: `${prefix}stream=query_events/dt=2026-02-01/a.parquet`,
                            },
                            {
                                Key: `${prefix}stream=unknown/dt=2026-01-01/a.parquet`,
                            },
                        ],
                    } as never;
                },
            );
        const summary = await new UsageUserActivityBuilder(storage, {
            runSqlWithMetrics: vi.fn(),
        }).runAll(now);
        expect(summary).toMatchObject({ skipped: 2, failed: 0 });
        // Two inventory pages plus raw/source checks for only two eligible partitions.
        expect(list).toHaveBeenCalledTimes(6);
    });

    it.each([
        { IsTruncated: true },
        { Contents: [{ Key: 'events/raw/outside-scope.parquet' }] },
    ])('rejects incomplete or out-of-scope inventory pages', async (page) => {
        vi.spyOn(S3.prototype, 'listObjectsV2').mockResolvedValue(
            page as never,
        );
        await expect(
            new UsageUserActivityBuilder(storage, {
                runSqlWithMetrics: vi.fn(),
            }).runAll(now),
        ).rejects.toThrow();
        expect(upload).not.toHaveBeenCalled();
    });

    it('reads all listing pages and stops without publishing on transform failure', async () => {
        const list = vi
            .spyOn(S3.prototype, 'listObjectsV2')
            .mockResolvedValueOnce({ Contents: [] } as never)
            .mockResolvedValueOnce({
                Contents: [
                    {
                        Key: `events/compacted/org_id=${org}/stream=query_events/dt=2026-01-01/first.parquet`,
                    },
                ],
                IsTruncated: true,
                NextContinuationToken: 'next',
            } as never)
            .mockResolvedValueOnce({
                Contents: [
                    {
                        Key: `events/compacted/org_id=${org}/stream=query_events/dt=2026-01-01/second.parquet`,
                    },
                ],
                IsTruncated: false,
            } as never);
        const runSqlWithMetrics = vi
            .fn()
            .mockRejectedValue(new Error('conversion failed'));
        await expect(
            new UsageUserActivityBuilder(storage, { runSqlWithMetrics }).run(
                org,
                '2026-01-01',
                '2026-01-01',
                now,
            ),
        ).rejects.toThrow('conversion failed');
        expect(list).toHaveBeenLastCalledWith(
            expect.objectContaining({ ContinuationToken: 'next' }),
        );
        expect(runSqlWithMetrics.mock.calls[0][0]).toContain('first.parquet');
        expect(runSqlWithMetrics.mock.calls[0][0]).toContain('second.parquet');
        expect(upload).not.toHaveBeenCalled();
    });

    it('fails closed when S3 truncates a listing without a continuation token', async () => {
        vi.spyOn(S3.prototype, 'listObjectsV2')
            .mockResolvedValueOnce({ Contents: [] } as never)
            .mockResolvedValueOnce({ IsTruncated: true } as never);
        const runSqlWithMetrics = vi.fn();
        await expect(
            new UsageUserActivityBuilder(storage, { runSqlWithMetrics }).run(
                org,
                '2026-01-01',
                '2026-01-01',
                now,
            ),
        ).rejects.toThrow('Incomplete S3 listing');
        expect(runSqlWithMetrics).not.toHaveBeenCalled();
    });

    it('keeps historical GCS summaries on upgrade and only builds changed or missing outputs', async () => {
        const source = {
            Key: `events/compacted/org_id=${org}/stream=query_events/dt=2026-01-01/test.parquet`,
            ETag: 'first-version',
            Size: 100,
        };
        vi.spyOn(S3.prototype, 'listObjectsV2').mockImplementation(
            async ({ Prefix }) =>
                ({
                    Contents: Prefix?.startsWith('events/raw/') ? [] : [source],
                }) as never,
        );
        const runSqlWithMetrics = vi.fn(async (sql: string) => {
            const output = sql.match(/TO '([^']+)' \(FORMAT/)![1];
            await writeFile(output, 'test parquet');
            return { queryMs: 1, bootstrapMs: 0, totalMs: 1 };
        });
        const run = () =>
            new UsageUserActivityBuilder(storage, { runSqlWithMetrics }).runAll(
                now,
            );
        upload.mockResolvedValue(undefined);
        // A pre-upgrade output must stay fresh when its source files are unchanged.
        let fingerprint = createHash('sha256')
            .update('1')
            .update(JSON.stringify([source.Key, source.ETag, source.Size]))
            .digest('hex');
        const client = new S3Client({
            ...buildS3ClientConfig({
                region: 'auto',
                endpoint: 'https://storage.googleapis.com',
                authMode: 'gcp_oauth',
            }),
            requestHandler: {
                handle: async () => ({
                    response: new HttpResponse({
                        statusCode: 200,
                        headers: { 'x-goog-meta-source-hash': fingerprint },
                    }),
                }),
                updateHttpClientConfig: () => {},
                httpHandlerConfigs: () => ({}),
            },
        });
        applyGcpOAuth(client);
        vi.spyOn(S3.prototype, 'headObject').mockImplementation(
            async (input) => client.send(new HeadObjectCommand(input)) as never,
        );
        try {
            expect(await run()).toMatchObject({ published: 0, unchanged: 1 });
            expect(runSqlWithMetrics).not.toHaveBeenCalled();
            expect(upload).not.toHaveBeenCalled();

            source.ETag = 'second-version';
            expect(await run()).toMatchObject({ published: 1, unchanged: 0 });
            expect(runSqlWithMetrics).toHaveBeenCalledTimes(1);
            expect(upload).toHaveBeenCalledTimes(1);
            const updatedFingerprint =
                uploadConstructor.mock.calls[0][0].params.Metadata[
                    'source-hash'
                ];
            expect(updatedFingerprint).not.toBe(fingerprint);
            fingerprint = updatedFingerprint;
            expect(await run()).toMatchObject({ published: 0, unchanged: 1 });
            expect(runSqlWithMetrics).toHaveBeenCalledTimes(1);

            // A new day without an output still gets the richer schema.
            source.Key = source.Key.replace('2026-01-01', '2026-01-02');
            vi.mocked(S3.prototype.headObject).mockRejectedValue({
                $metadata: { httpStatusCode: 404 },
            });
            expect(await run()).toMatchObject({ published: 1, unchanged: 0 });
            expect(runSqlWithMetrics).toHaveBeenCalledTimes(2);
            expect(upload).toHaveBeenCalledTimes(2);
            expect(runSqlWithMetrics.mock.calls[1][0]).toContain(
                'AS actor_category',
            );
            expect(runSqlWithMetrics.mock.calls[1][0]).toContain(
                'AS activity_source',
            );
        } finally {
            client.destroy();
        }
    });

    it('propagates upload failures so operators retry the failed day', async () => {
        vi.spyOn(S3.prototype, 'listObjectsV2')
            .mockResolvedValueOnce({ Contents: [] } as never)
            .mockResolvedValueOnce({
                Contents: [
                    {
                        Key: `events/compacted/org_id=${org}/stream=query_events/dt=2026-01-01/test.parquet`,
                    },
                ],
            } as never);
        const runSqlWithMetrics = vi.fn(async (sql: string) => {
            const output = sql.match(/TO '([^']+)' \(FORMAT/)![1];
            await writeFile(output, 'test parquet');
            return { queryMs: 1, bootstrapMs: 0, totalMs: 1 };
        });
        upload.mockRejectedValueOnce(new Error('upload failed'));
        await expect(
            new UsageUserActivityBuilder(storage, { runSqlWithMetrics }).run(
                org,
                '2026-01-01',
                '2026-01-01',
                now,
            ),
        ).rejects.toThrow('upload failed');
    });
});
