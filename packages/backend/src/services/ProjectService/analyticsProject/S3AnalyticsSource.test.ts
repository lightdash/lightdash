import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DuckDBInstance } from '@duckdb/node-api';
import { ParameterError } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { queryEventsCompactedColumns } from '../../../analytics/eventStream/queryEventsStream';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

vi.mock('../../../clients/Aws/S3BaseClient', () => ({
    createS3ClientFromConfig: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));
const gcsSign = vi.hoisted(() => vi.fn());
vi.mock('@google-cloud/storage', () => ({
    Storage: class {
        // eslint-disable-next-line class-methods-use-this
        bucket(bucket: string) {
            return {
                file: (objectKey: string) => ({
                    getSignedUrl: (options: Record<string, unknown>) =>
                        gcsSign(bucket, objectKey, options),
                }),
            };
        }
    },
}));
vi.mock('@duckdb/node-api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@duckdb/node-api')>()),
    DuckDBInstance: { create: vi.fn() },
}));

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
    const noDataMessage =
        'No analytics data is available yet. Newly captured events become available after daily processing. Try again after the next daily update.';
    const connection = { run: vi.fn(), closeSync: vi.fn() };
    const closeInstance = vi.fn();

    const testConnection = () =>
        new DuckdbWarehouseClient({
            type: 'duckdb_parquet',
            resolveSource: createS3AnalyticsSourceResolver(config),
        }).test();

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(createS3ClientFromConfig).mockReturnValue({
            send,
            destroy,
        } as unknown as ReturnType<typeof createS3ClientFromConfig>);
        send.mockResolvedValue({ Contents: [{ Key: key() }] });
        vi.mocked(getSignedUrl).mockResolvedValue('signed-url');
        vi.mocked(DuckDBInstance.create).mockResolvedValue({
            connect: async () => connection,
            closeSync: closeInstance,
        } as unknown as Awaited<ReturnType<typeof DuckDBInstance.create>>);
    });

    it('serves inventory-only organizations with empty activity tables', async () => {
        send.mockResolvedValue({
            Contents: [{ Key: `${prefix}dim=content/content.parquet` }],
        });
        const source = await createS3AnalyticsSourceResolver(config)();
        expect(source.tables.map(({ name }) => name)).toEqual([
            'lightdash_content',
        ]);
        expect(source.emptyTables?.map(({ name }) => name)).toContain(
            'content_views',
        );
    });

    it('signs only requested tables while preserving every retained date', async () => {
        const queryKey = key('query_events');
        const oldExport = key('export_events', '2025-09-07');
        const newExport = key('export_events');
        send.mockResolvedValueOnce({
            Contents: [{ Key: queryKey }, { Key: oldExport }],
            IsTruncated: true,
            NextContinuationToken: 'next',
        }).mockResolvedValueOnce({ Contents: [{ Key: newExport }] });
        const source = await createS3AnalyticsSourceResolver(config)([
            'export_events',
        ]);
        expect(source.tables.map(({ name }) => name)).toEqual([
            'export_events',
        ]);
        expect(
            vi
                .mocked(getSignedUrl)
                .mock.calls.map(
                    ([, command]) => (command as GetObjectCommand).input.Key,
                ),
        ).toEqual([oldExport, newExport]);
        expect(source.emptyTables?.map(({ name }) => name)).toContain(
            'query_events',
        );
    });

    it.each([undefined, []])(
        'keeps full discovery when references are unresolved: %s',
        async (tables) => {
            send.mockResolvedValue({
                Contents: [
                    { Key: key('query_events') },
                    { Key: key('export_events') },
                ],
            });
            const source =
                await createS3AnalyticsSourceResolver(config)(tables);
            expect(source.tables).toHaveLength(2);
            expect(getSignedUrl).toHaveBeenCalledTimes(2);
        },
    );

    it('keeps a missing requested stream empty without dropping the organization data-availability check', async () => {
        send.mockResolvedValue({ Contents: [{ Key: key('query_events') }] });
        const source = await createS3AnalyticsSourceResolver(config)([
            'export_events',
        ]);
        expect(source.tables).toEqual([]);
        expect(source.emptyTables?.map(({ name }) => name)).toContain(
            'export_events',
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
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
        expect(source).toMatchObject({
            scope: `https://storage.googleapis.com/example-bucket/events/compacted/org_id%3D${org}/`,
            signedUrls: true,
            tables: [{ name: 'query_events', urls: ['signed-url'] }],
        });
        expect(JSON.stringify(source)).not.toContain('writer-');
        expect(destroy).toHaveBeenCalledOnce();
    });

    it.each(['s3', 'gcp_oauth'] as const)(
        'bounds %s signing concurrency and preserves the complete manifest',
        async (authMode) => {
            const keys = Array.from({ length: 19 }, (_, i) =>
                key().replace('part-1', `part-${i}`),
            );
            send.mockResolvedValue({ Contents: keys.map((Key) => ({ Key })) });
            let active = 0;
            let peak = 0;
            const sign = async (objectKey: string) => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise((resolve) => {
                    setTimeout(resolve, 1);
                });
                active -= 1;
                return `signed:${objectKey}`;
            };
            vi.mocked(getSignedUrl).mockImplementation((_client, command) =>
                sign((command as GetObjectCommand).input.Key!),
            );
            gcsSign.mockImplementation(async (_bucket, objectKey) => [
                await sign(objectKey),
            ]);
            const source = await createS3AnalyticsSourceResolver({
                ...config,
                storage: {
                    ...config.storage,
                    ...(authMode === 'gcp_oauth' ? { authMode } : {}),
                },
            })();
            expect(peak).toBe(8);
            expect(active).toBe(0);
            expect(source.tables[0].urls).toEqual(
                keys.map((k) => `signed:${k}`).sort(),
            );
            expect(
                authMode === 'gcp_oauth' ? gcsSign : getSignedUrl,
            ).toHaveBeenCalledTimes(19);
            expect(destroy).toHaveBeenCalledOnce();
        },
    );

    it('drains in-flight signing before cleanup and never starts another batch after failure', async () => {
        send.mockResolvedValue({
            Contents: Array.from({ length: 20 }, (_, i) => ({
                Key: key().replace('part-1', `part-${i}`),
            })),
        });
        let release: () => void = () => {};
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.mocked(getSignedUrl)
            .mockRejectedValueOnce(new Error('X-Amz-Signature=secret'))
            .mockImplementation(async () => {
                await pending;
                return 'signed-url';
            });
        const resolution = createS3AnalyticsSourceResolver(config)().catch(
            (error: unknown) => error,
        );
        await vi.waitFor(() => expect(getSignedUrl).toHaveBeenCalledTimes(8));
        expect(destroy).not.toHaveBeenCalled();
        release();
        expect(await resolution).toEqual(
            new Error(
                'Analytics storage access failed. Check bucket credentials, organization and compacted data availability.',
            ),
        );
        expect(getSignedUrl).toHaveBeenCalledTimes(8);
        expect(destroy).toHaveBeenCalledOnce();
    });

    it('keeps simultaneous organizations isolated', async () => {
        const otherOrg = '00000000-0000-0000-0000-000000000002';
        send.mockImplementation(async (command: ListObjectsV2Command) => ({
            Contents: Array.from({ length: 12 }, (_, i) => ({
                Key: `${command.input.Prefix}stream=query_events/dt=2026-09-07/part-${i}.parquet`,
            })),
        }));
        vi.mocked(getSignedUrl).mockImplementation(async (_client, command) => {
            await new Promise((resolve) => {
                setTimeout(resolve, 1);
            });
            return `signed:${(command as GetObjectCommand).input.Key}`;
        });
        const sources = await Promise.all(
            [org, otherOrg].map((organizationUuid) =>
                createS3AnalyticsSourceResolver({
                    ...config,
                    organizationUuid,
                })(),
            ),
        );
        sources.forEach((source, i) => {
            const expectedOrg = [org, otherOrg][i];
            expect(source.scope).toContain(`org_id%3D${expectedOrg}/`);
            expect(source.tables[0].urls).toHaveLength(12);
            expect(
                source.tables[0].urls.every((url) =>
                    url.includes(`org_id=${expectedOrg}/`),
                ),
            ).toBe(true);
        });
        expect(destroy).toHaveBeenCalledTimes(2);
    });

    it('validates the full listing page before starting its signing requests', async () => {
        send.mockResolvedValue({
            Contents: [
                { Key: key() },
                { Key: 'events/compacted/org_id=other/file.parquet' },
            ],
        });
        await expect(createS3AnalyticsSourceResolver(config)()).rejects.toThrow(
            'Analytics storage access failed',
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledOnce();
    });

    it('uses Google signed URLs for workload identity without AWS signing', async () => {
        const signedUrl = `https://storage.googleapis.com/example-bucket/${key().replace(/=/g, '%3D')}?X-Goog-Signature=test`;
        gcsSign.mockResolvedValue([signedUrl]);
        const source = await createS3AnalyticsSourceResolver({
            ...config,
            storage: {
                endpoint: config.storage.endpoint,
                bucket: config.storage.bucket,
                region: config.storage.region,
                authMode: 'gcp_oauth',
            },
        })();
        expect(source.tables).toEqual([
            {
                name: 'query_events',
                urls: [signedUrl],
                columns: queryEventsCompactedColumns,
            },
        ]);
        expect(gcsSign).toHaveBeenCalledWith(config.storage.bucket, key(), {
            version: 'v4',
            action: 'read',
            expires: expect.any(Number),
        });
        expect(getSignedUrl).not.toHaveBeenCalled();
        expect(source).not.toHaveProperty('httpAuth');
        expect(source).not.toHaveProperty('s3Config');
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
        }).mockResolvedValueOnce({
            Contents: [
                { Key: key('ai_usage') },
                { Key: key('data_app_events') },
                { Key: key('export_events') },
            ],
        });
        const source = await createS3AnalyticsSourceResolver(config)();
        expect(source.tables.map(({ name }) => name)).toEqual([
            'query_events',
            'ai_usage',
            'data_app_events',
            'export_events',
        ]);
        expect(getSignedUrl).toHaveBeenCalledTimes(5);
        expect(
            vi
                .mocked(getSignedUrl)
                .mock.calls.map(
                    ([, command]) => (command as GetObjectCommand).input.Key,
                ),
        ).toEqual([
            key('query_events', '2025-09-07'),
            key(),
            key('ai_usage'),
            key('data_app_events'),
            key('export_events'),
        ]);
        expect(send.mock.calls[1][0].input.ContinuationToken).toBe('next');
    });

    it('signs only the deterministic dimension snapshots and supplies missing lookup schemas', async () => {
        send.mockResolvedValue({
            Contents: [
                { Key: key() },
                { Key: `${prefix}dim=charts/charts.parquet` },
                { Key: `${prefix}dim=charts/old.parquet` },
                { Key: `${prefix}dim=users/users.parquet` },
                { Key: `${prefix}dim=users/backup/users.parquet` },
                { Key: `${prefix}dim=agents/agents.parquet` },
                { Key: `${prefix}dim=agents/old.parquet` },
            ],
        });
        const source = await createS3AnalyticsSourceResolver(config)();
        expect(source.tables.map(({ name }) => name)).toEqual([
            'query_events',
            'lightdash_charts',
            'lightdash_users',
            'lightdash_agents',
        ]);
        expect(source.emptyTables?.map(({ name }) => name)).toEqual([
            'lightdash_dashboards',
            'lightdash_content',
            'ai_usage',
            'data_app_events',
            'export_events',
            'agent_steps',
            'mcp_tool_calls',
            'content_views',
            'agent_request_events',
            'user_activity',
        ]);
        expect(getSignedUrl).toHaveBeenCalledTimes(4);
    });

    it('signs only supported user activity partitions inside the tenant scope', async () => {
        const activityKey = `${prefix}model=user_activity/stream=export_events/dt=2026-09-07/activity.parquet`;
        send.mockResolvedValue({
            Contents: [
                { Key: activityKey },
                {
                    Key: activityKey.replace(
                        'activity.parquet',
                        'backup.parquet',
                    ),
                },
                { Key: activityKey.replace('export_events', 'unknown_stream') },
                {
                    Key: activityKey.replace(
                        'model=user_activity',
                        'model=other',
                    ),
                },
                { Key: key('agent_steps') },
            ],
        });
        const source = await createS3AnalyticsSourceResolver(config)();
        expect(source.tables.map(({ name }) => name)).toEqual([
            'user_activity',
            'agent_steps',
        ]);
        expect(
            vi
                .mocked(getSignedUrl)
                .mock.calls.map(
                    ([, command]) => (command as GetObjectCommand).input.Key,
                ),
        ).toEqual([activityKey, key('agent_steps')]);
        expect(source.scope).toContain(`org_id%3D${org}/`);
    });

    it('does not treat dimension-only storage as captured event data', async () => {
        send.mockResolvedValue({
            Contents: [{ Key: `${prefix}dim=users/users.parquet` }],
        });
        await expect(createS3AnalyticsSourceResolver(config)()).rejects.toThrow(
            noDataMessage,
        );
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
        {
            Contents: [
                {
                    Key: 'events/compacted/org_id=00000000-0000-0000-0000-000000000002/stream=export_events/dt=2026-09-07/part.parquet',
                },
            ],
        },
        { Contents: [], IsTruncated: true },
    ])('fails closed on invalid or incomplete manifests', async (response) => {
        send.mockResolvedValue(response);
        await expect(createS3AnalyticsSourceResolver(config)()).rejects.toThrow(
            'Analytics storage access failed',
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledOnce();
    });

    it.each([
        { Contents: [], IsTruncated: false },
        { IsTruncated: false },
        { Contents: [{ Key: key('other') }] },
        { Contents: [{ Key: `${prefix}../other/part.parquet` }] },
    ])(
        'explains missing data through the project connection test',
        async (response) => {
            send.mockResolvedValue(response);
            await expect(testConnection()).rejects.toEqual(
                new ParameterError(noDataMessage),
            );
            expect(getSignedUrl).not.toHaveBeenCalled();
            expect(destroy).toHaveBeenCalledOnce();
            // The dependency parser and query session are both disposed.
            expect(connection.closeSync).toHaveBeenCalledTimes(2);
            expect(closeInstance).toHaveBeenCalledTimes(2);
        },
    );

    it('waits for all listing pages before reporting no data', async () => {
        send.mockResolvedValueOnce({
            Contents: [],
            IsTruncated: true,
            NextContinuationToken: 'next',
        }).mockResolvedValueOnce({ Contents: [], IsTruncated: false });
        await expect(testConnection()).rejects.toEqual(
            new ParameterError(noDataMessage),
        );
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].input.ContinuationToken).toBe('next');
    });

    it.each(['storage failure', 'incomplete pagination', 'later page failure'])(
        'keeps %s sanitized through the project connection test',
        async (failure) => {
            if (failure === 'storage failure') {
                send.mockRejectedValue(new ParameterError('writer-secret'));
            } else if (failure === 'incomplete pagination') {
                send.mockResolvedValue({ Contents: [], IsTruncated: true });
            } else {
                send.mockResolvedValueOnce({
                    Contents: [],
                    IsTruncated: true,
                    NextContinuationToken: 'next',
                }).mockRejectedValueOnce(new Error('writer-secret'));
            }
            await expect(testConnection()).rejects.toThrow(
                /^Internal analytics query failed\. Check storage access and query permissions\.$/,
            );
            expect(getSignedUrl).not.toHaveBeenCalled();
            expect(destroy).toHaveBeenCalledOnce();
        },
    );

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
