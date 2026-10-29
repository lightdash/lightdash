import { HeadObjectCommand, S3, S3Client } from '@aws-sdk/client-s3';
import { HttpResponse } from '@smithy/protocol-http';
import { writeFile } from 'fs/promises';
import { applyGcpOAuth } from '../../clients/Aws/gcpOAuth';
import { buildS3ClientConfig } from '../../clients/Aws/S3BaseClient';
import Logger from '../../logging/logger';
import {
    UsageUserActivityBuilder,
    validateUserActivityRange,
} from './UsageUserActivityBuilder';

const upload = vi.hoisted(() => vi.fn());
const uploadConstructor = vi.hoisted(() => vi.fn());
const workLimit = vi.hoisted(() => ({ override: null as number | null }));
vi.mock('./usageProcessingLimits', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('./usageProcessingLimits')>();
    return {
        get MAX_PARTITIONS_PER_RUN() {
            return workLimit.override ?? original.MAX_PARTITIONS_PER_RUN;
        },
    };
});
vi.mock('../../logging/logger', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
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
        workLimit.override = null;
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

    it('processes more than 500 changed partitions with the default work budget', async () => {
        const orgIds = Array.from(
            { length: 80 },
            (_, index) =>
                `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        );
        vi.spyOn(S3.prototype, 'listObjectsV2').mockImplementation(
            async (input) => {
                if (input.Prefix?.endsWith('/stream=query_events/'))
                    return {
                        Contents: Array.from({ length: 7 }, (_, index) => ({
                            Key: `${input.Prefix}dt=2026-01-${25 + index}/part.parquet`,
                        })),
                    } as never;
                if (input.Prefix?.includes('/dt='))
                    throw new Error('synthetic partition failure');
                return { Contents: [] } as never;
            },
        );
        const summary = await new UsageUserActivityBuilder(storage, {
            runSqlWithMetrics: vi.fn(),
        }).runAll(now, orgIds);
        expect(summary).toMatchObject({ failed: 560, limitReached: false });
    });

    it.each([
        { partitions: 3, limitReached: false },
        { partitions: 4, limitReached: true },
    ])(
        'bounds changed work across organizations with $partitions source partitions',
        async ({ partitions, limitReached }) => {
            workLimit.override = 3;
            const orgIds = [org, '22222222-2222-4222-8222-222222222222'];
            const list = vi
                .spyOn(S3.prototype, 'listObjectsV2')
                .mockImplementation(async ({ Prefix }) => {
                    if (Prefix?.endsWith('/stream=query_events/')) {
                        const count = Prefix.includes(org) ? 2 : partitions - 2;
                        return {
                            Contents: Array.from(
                                { length: count },
                                (_, index) => ({
                                    Key: `${Prefix}dt=2026-01-${25 + index}/part.parquet`,
                                }),
                            ),
                        } as never;
                    }
                    if (Prefix?.includes('/dt='))
                        throw new Error('synthetic partition failure');
                    return { Contents: [] } as never;
                });
            const summary = await new UsageUserActivityBuilder(storage, {
                runSqlWithMetrics: vi.fn(),
            }).runAll(now, orgIds);
            expect(summary).toMatchObject({ failed: 3, limitReached });
            expect(
                list.mock.calls.filter(([input]) =>
                    input.Prefix?.includes('/dt='),
                ),
            ).toHaveLength(3);
            if (limitReached)
                expect(Logger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('3-partition work limit'),
                );
            else expect(Logger.warn).not.toHaveBeenCalled();
        },
    );

    it('does not spend the changed-work budget on unchanged summaries', async () => {
        workLimit.override = 2;
        const prefix = `events/compacted/org_id=${org}/stream=query_events/`;
        const sources = Array.from({ length: 5 }, (_, index) => ({
            Key: `${prefix}dt=2026-01-${25 + index}/part.parquet`,
            ETag: `version-${index}`,
            Size: 100,
        }));
        const fingerprints = new Map<string, string>();
        vi.spyOn(S3.prototype, 'listObjectsV2').mockImplementation(
            async ({ Prefix }) => {
                if (Prefix === prefix) return { Contents: sources } as never;
                if (Prefix?.startsWith('events/raw/'))
                    return { Contents: [] } as never;
                return {
                    Contents: sources.filter((source) =>
                        source.Key.startsWith(Prefix!),
                    ),
                } as never;
            },
        );
        vi.mocked(S3.prototype.headObject).mockImplementation(
            async ({ Key }) => {
                const fingerprint = fingerprints.get(Key!);
                if (!fingerprint)
                    throw Object.assign(new Error('Summary not found'), {
                        $metadata: { httpStatusCode: 404 },
                    });
                return { Metadata: { 'source-hash': fingerprint } } as never;
            },
        );
        upload.mockResolvedValue(undefined);
        const runSqlWithMetrics = vi.fn(async (sql: string) => {
            const output = sql.match(/TO '([^']+)' \(FORMAT/)![1];
            await writeFile(output, 'test parquet');
            return { queryMs: 1, bootstrapMs: 0, totalMs: 1 };
        });
        const run = () =>
            new UsageUserActivityBuilder(storage, { runSqlWithMetrics }).runAll(
                now,
                [org],
            );
        expect(await run()).toMatchObject({ published: 2, limitReached: true });
        for (const [options] of uploadConstructor.mock.calls) {
            fingerprints.set(
                options.params.Key,
                options.params.Metadata['source-hash'],
            );
        }
        runSqlWithMetrics.mockClear();
        expect(await run()).toMatchObject({
            published: 2,
            unchanged: 2,
            failed: 0,
            limitReached: true,
        });
        expect(runSqlWithMetrics).toHaveBeenCalledTimes(2);
    });

    it('ignores history older than seven closed UTC days', async () => {
        vi.spyOn(S3.prototype, 'listObjectsV2').mockImplementation(
            async (input) =>
                ({
                    Contents: input.Prefix?.endsWith('stream=query_events/')
                        ? [
                              {
                                  Key: `events/compacted/org_id=${org}/stream=query_events/dt=2026-01-24/part.parquet`,
                              },
                          ]
                        : [],
                }) as never,
        );
        const runSqlWithMetrics = vi.fn();
        const summary = await new UsageUserActivityBuilder(storage, {
            runSqlWithMetrics,
        }).runAll(now, [org]);
        expect(summary).toMatchObject({ published: 0, failed: 0 });
        expect(runSqlWithMetrics).not.toHaveBeenCalled();
    });

    it('does not list storage when no organizations are eligible', async () => {
        const list = vi
            .spyOn(S3.prototype, 'listObjectsV2')
            .mockResolvedValue({ Contents: [] } as never);
        const runSqlWithMetrics = vi.fn();
        expect(
            await new UsageUserActivityBuilder(storage, {
                runSqlWithMetrics,
            }).runAll(now, []),
        ).toMatchObject({ published: 0, failed: 0 });
        expect(list).not.toHaveBeenCalled();
        expect(runSqlWithMetrics).not.toHaveBeenCalled();
    });

    it('streams inventory pages and processes each closed event partition once across page boundaries', async () => {
        const prefix = `events/compacted/org_id=${org}/`;
        const partition = `${prefix}stream=query_events/dt=2026-01-25/`;
        const list = vi
            .spyOn(S3.prototype, 'listObjectsV2')
            .mockImplementation(
                async (input: {
                    Prefix?: string;
                    ContinuationToken?: string;
                }) => {
                    if (input.Prefix !== `${prefix}stream=query_events/`)
                        return { Contents: [] } as never;
                    if (!input.ContinuationToken)
                        return {
                            Contents: [{ Key: `${partition}a.parquet` }],
                            IsTruncated: true,
                            NextContinuationToken: 'page2',
                        } as never;
                    return {
                        Contents: [
                            { Key: `${partition}b.parquet` },
                            {
                                Key: `${prefix}stream=query_events/dt=2026-01-26/a.parquet`,
                            },
                            {
                                Key: `${prefix}stream=query_events/dt=2026-02-01/a.parquet`,
                            },
                        ],
                    } as never;
                },
            );
        const summary = await new UsageUserActivityBuilder(storage, {
            runSqlWithMetrics: vi.fn(),
        }).runAll(now, [org]);
        expect(summary).toMatchObject({ skipped: 2, failed: 0 });
        // Two inventory pages plus raw/source checks for only two eligible partitions.
        expect(list).toHaveBeenCalledTimes(12);
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
            }).runAll(now, [org]),
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

    it('skips a GCS summary on an unchanged rerun but rebuilds after its source changes', async () => {
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
            new UsageUserActivityBuilder(storage, { runSqlWithMetrics }).run(
                org,
                '2026-01-01',
                '2026-01-01',
                now,
            );
        upload.mockResolvedValue(undefined);
        expect(await run()).toMatchObject({ published: 1, unchanged: 0 });
        const fingerprint =
            uploadConstructor.mock.calls[0][0].params.Metadata['source-hash'];
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
            expect(runSqlWithMetrics).toHaveBeenCalledTimes(1);
            expect(upload).toHaveBeenCalledTimes(1);
            source.ETag = 'second-version';
            expect(await run()).toMatchObject({ published: 1, unchanged: 0 });
            expect(runSqlWithMetrics).toHaveBeenCalledTimes(2);
            expect(upload).toHaveBeenCalledTimes(2);
            expect(
                uploadConstructor.mock.calls[1][0].params.Metadata[
                    'source-hash'
                ],
            ).not.toBe(fingerprint);
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
