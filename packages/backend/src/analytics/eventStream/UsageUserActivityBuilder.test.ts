import { S3 } from '@aws-sdk/client-s3';
import { writeFile } from 'fs/promises';
import {
    UsageUserActivityBuilder,
    validateUserActivityRange,
} from './UsageUserActivityBuilder';

const upload = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/lib-storage', () => ({
    Upload: class {
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
