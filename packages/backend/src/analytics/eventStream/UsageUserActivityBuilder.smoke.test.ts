import { S3 } from '@aws-sdk/client-s3';
import { WarehouseTypes } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { execFile } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { promisify } from 'util';
import { gzipSync } from 'zlib';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { createS3AnalyticsSourceResolver } from '../../services/ProjectService/analyticsProject/S3AnalyticsSource';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from './registry';
import { UsageEventsCompactor } from './UsageEventsCompactor';
import { UsageUserActivityBuilder } from './UsageUserActivityBuilder';
import { analyticsStreams, userActivityKey } from './userActivity';

const userUuid = (n: number) =>
    createHash('md5')
        .update(String(n))
        .digest('hex')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

// Real compaction -> nightly derivation -> signed manifest -> compiled Explore queries.
describe.skipIf(!process.env.USAGE_USER_ACTIVITY_SMOKE_ENDPOINT)(
    'user activity local S3 load test',
    () => {
        it('serves matching event/user metrics and safely refreshes every captured stream', async () => {
            vi.unstubAllGlobals();
            const endpoint = process.env.USAGE_USER_ACTIVITY_SMOKE_ENDPOINT!;
            if (
                !['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)
            )
                throw new Error('Smoke test requires local S3');
            const storage = {
                endpoint,
                bucket: `usage-users-${randomUUID()}`,
                region: 'us-east-1',
                // Public development defaults; the loopback-only guard above is mandatory.
                accessKey: 'minioadmin',
                secretKey: 'minioadmin',
                forcePathStyle: true,
            };
            const s3 = new S3({
                endpoint,
                region: storage.region,
                forcePathStyle: true,
                credentials: {
                    accessKeyId: storage.accessKey,
                    secretAccessKey: storage.secretKey,
                },
            });
            const duckdb = new DuckdbWarehouseClient(
                {
                    type: 'duckdb_s3',
                    s3Config: getDuckdbRuntimeConfig(storage)!,
                },
                { resourceLimits: { memoryLimit: '256MB', threads: 1 } },
            );
            const org = randomUUID();
            const otherOrg = randomUUID();
            const deletedUser = randomUUID();
            const date = '2026-01-01';
            const now = new Date('2026-01-02T00:00:00Z');
            const base = `s3://${storage.bucket}`;
            const rows = Number(
                process.env.USAGE_USER_ACTIVITY_SMOKE_ROWS ?? 100_000,
            );
            if (
                !Number.isSafeInteger(rows) ||
                rows < 10000 ||
                rows > 10000000 ||
                rows % 10000 !== 0
            )
                throw new Error(
                    'Rows per stream must be a multiple of 10000, between 10000 and 10000000',
                );
            const model = {
                async *getOrganizations() {
                    yield { organization_id: 1, organization_uuid: org };
                    yield { organization_id: 2, organization_uuid: otherOrg };
                },
                async *getJsonLines(
                    organization: { organization_uuid: string },
                    dimension: string,
                ) {
                    if (dimension === 'users') {
                        yield `${JSON.stringify({ org_id: organization.organization_uuid, user_id: userUuid(0), name: 'Same name' })}\n`;
                        yield `${JSON.stringify({ org_id: organization.organization_uuid, user_id: userUuid(1), name: 'Same name' })}\n`;
                    }
                },
            };
            const compact = () =>
                new UsageEventsCompactor({
                    s3Config: storage,
                    prometheusMetrics: null,
                    usageDimensionsModel: model,
                }).run(now);
            const reader = new DuckdbWarehouseClient({
                type: 'duckdb_parquet',
                resolveSource: createS3AnalyticsSourceResolver({
                    storage,
                    organizationUuid: org,
                }),
            });
            const explores = createAnalyticsExplores();
            const query = async (
                name: string,
                metrics: string[],
                byUser = false,
            ) => {
                const explore = explores.find((item) => item.name === name)!;
                const compiled = new MetricQueryBuilder({
                    explore,
                    compiledMetricQuery: {
                        exploreName: name,
                        dimensions: byUser
                            ? [`${name}_user_id`, 'lightdash_users_name']
                            : [],
                        metrics: metrics.map((metric) => `${name}_${metric}`),
                        filters: {},
                        sorts: [],
                        limit: 20000,
                        tableCalculations: [],
                        compiledTableCalculations: [],
                        compiledAdditionalMetrics: [],
                        compiledCustomDimensions: [],
                    },
                    warehouseSqlBuilder: warehouseSqlBuilderFromType(
                        WarehouseTypes.DUCKDB,
                    ),
                    intrinsicUserAttributes: {},
                    parameterDefinitions: {},
                    timezone: 'UTC',
                }).compileQuery();
                expect(compiled.warnings).toEqual([]);
                return (await reader.runQuery(compiled.query)).rows;
            };
            const raw = async (
                stream: string,
                entries: object[],
                tenant = org,
                file = 'test',
            ) =>
                s3.putObject({
                    Bucket: storage.bucket,
                    Key: `events/raw/org_id=${tenant}/stream=${stream}/dt=${date}/${file}.jsonl.gz`,
                    Body: gzipSync(
                        entries.map((row) => JSON.stringify(row)).join('\n'),
                    ),
                });
            const prefix = (stream: string, tenant = org) =>
                `events/compacted/org_id=${tenant}/stream=${stream}/dt=${date}`;
            await s3.createBucket({ Bucket: storage.bucket });
            try {
                for (const stream of analyticsStreams) {
                    const event = {
                        query_events: "'query.completed'",
                        ai_usage: "'ai.usage'",
                        export_events:
                            "CASE n % 3 WHEN 0 THEN 'download_results.completed' WHEN 1 THEN 'download_results.started' ELSE 'download_results.error' END",
                        data_app_events:
                            "CASE n % 2 WHEN 0 THEN 'data_app.view' ELSE 'data_app.created' END",
                        agent_steps:
                            "CASE n % 2 WHEN 0 THEN 'ai_agent.step_completed' ELSE 'ai_agent.tool_call_completed' END",
                    }[stream];
                    const values: Record<string, string> = {
                        org_id: `'${org}'`,
                        user_id: 'md5((n % 10000)::VARCHAR)::UUID::VARCHAR',
                        project_id: "'project-' || (n % 3)",
                        query_id: "'query-' || n",
                        event_name: event,
                        event_ts: `TIMESTAMP '${date} 12:00:00'`,
                        format: "'csv'",
                        total_tokens: '10',
                        input_tokens: '6',
                        output_tokens: '4',
                    };
                    // No large JS fixture: generate typed Parquet inside DuckDB.
                    // eslint-disable-next-line no-await-in-loop
                    await duckdb.runSqlWithMetrics(
                        `COPY (SELECT ${compactedStreamSchemas[stream].map(({ name, type }) => `(${values[name] ?? 'NULL'})::${type} AS "${name}"`).join(', ')} FROM range(${rows}) t(n)) TO '${base}/${prefix(stream)}/load.parquet' (FORMAT PARQUET, COMPRESSION zstd)`,
                    );
                }
                const exportRows = [
                    userUuid(0),
                    userUuid(1),
                    deletedUser,
                    null,
                ].map((user_id) => ({
                    org_id: org,
                    user_id,
                    event_name: 'download_results.completed',
                    event_ts: `${date}T13:00:00Z`,
                    project_id: 'another-project',
                    format: 'csv',
                    job_id: randomUUID(),
                }));
                await raw('export_events', exportRows);
                await raw(
                    'export_events',
                    [{ ...exportRows[0], org_id: otherOrg }],
                    otherOrg,
                );
                const start = performance.now();
                let peakRss = process.memoryUsage().rss;
                const sample = setInterval(() => {
                    peakRss = Math.max(peakRss, process.memoryUsage().rss);
                }, 25);
                try {
                    expect((await compact()).users).toMatchObject({
                        published: 6,
                        failed: 0,
                    });
                } finally {
                    clearInterval(sample);
                }
                console.log(
                    JSON.stringify({
                        syntheticEvents: rows * 5 + 5,
                        elapsedMs: Math.round(performance.now() - start),
                        sampledPeakRssMiB: Math.round(peakRss / 1024 / 1024),
                        duckdbMemoryLimit: '256MB',
                        threads: 1,
                    }),
                );
                const userMetrics = [
                    'total_queries',
                    'total_csv_downloads',
                    'total_downloads',
                    'total_data_app_views',
                    'total_ai_calls',
                    'total_tokens_used',
                    'total_steps',
                    'total_tool_calls',
                ];
                const totals = (await query('user_activity', userMetrics))[0];
                for (const [stream, eventMetric, userMetric] of [
                    ['query_events', 'total_queries', 'total_queries'],
                    [
                        'export_events',
                        'total_csv_downloads',
                        'total_csv_downloads',
                    ],
                    ['export_events', 'total_downloads', 'total_downloads'],
                    ['data_app_events', 'total_views', 'total_data_app_views'],
                    ['ai_usage', 'total_ai_calls', 'total_ai_calls'],
                    ['ai_usage', 'total_tokens_used', 'total_tokens_used'],
                    ['agent_steps', 'total_steps', 'total_steps'],
                    ['agent_steps', 'total_tool_calls', 'total_tool_calls'],
                ]) {
                    // eslint-disable-next-line no-await-in-loop
                    const eventTotals = (await query(stream, [eventMetric]))[0];
                    expect(Number(totals[`user_activity_${userMetric}`])).toBe(
                        Number(eventTotals[`${stream}_${eventMetric}`]),
                    );
                }
                expect(Number(totals.user_activity_total_queries)).toBe(rows);
                expect(Number(totals.user_activity_total_csv_downloads)).toBe(
                    Math.ceil(rows / 3) + 4,
                );
                expect(Number(totals.user_activity_total_tokens_used)).toBe(
                    rows * 10,
                ); // agent_steps tokens are not counted twice
                const byUser = await query(
                    'user_activity',
                    ['total_csv_downloads'],
                    true,
                );
                expect(
                    byUser.find(
                        (row) => row.user_activity_user_id === userUuid(0),
                    )?.lightdash_users_name,
                ).toBe('Same name');
                expect(
                    byUser.find(
                        (row) => row.user_activity_user_id === userUuid(1),
                    )?.lightdash_users_name,
                ).toBe('Same name');
                expect(
                    byUser.find(
                        (row) => row.user_activity_user_id === deletedUser,
                    ),
                ).toMatchObject({
                    lightdash_users_name: 'Unknown user',
                    user_activity_total_csv_downloads: '1',
                });
                expect(
                    byUser.find((row) => row.user_activity_user_id === null),
                ).toMatchObject({
                    lightdash_users_name: 'Unknown user',
                    user_activity_total_csv_downloads: '1',
                });
                expect(
                    byUser.reduce(
                        (sum, row) =>
                            sum + Number(row.user_activity_total_csv_downloads),
                        0,
                    ),
                ).toBe(Number(totals.user_activity_total_csv_downloads));
                const key = userActivityKey(org, 'export_events', date);
                const first = await s3.headObject({
                    Bucket: storage.bucket,
                    Key: key,
                });
                expect((await compact()).users).toMatchObject({
                    published: 0,
                    unchanged: 6,
                    failed: 0,
                });
                expect(
                    (await s3.headObject({ Bucket: storage.bucket, Key: key }))
                        .ETag,
                ).toBe(first.ETag);
                // The scheduler detects late inputs even for older retained partitions.
                await raw(
                    'export_events',
                    [{ ...exportRows[0], job_id: randomUUID() }],
                    org,
                    'late',
                );
                expect((await compact()).users).toMatchObject({
                    published: 1,
                    unchanged: 5,
                    failed: 0,
                });
                expect(
                    Number(
                        (
                            await query('user_activity', [
                                'total_csv_downloads',
                            ])
                        )[0].user_activity_total_csv_downloads,
                    ),
                ).toBe(Math.ceil(rows / 3) + 5);
                const good = await s3.headObject({
                    Bucket: storage.bucket,
                    Key: key,
                });
                const corruptKey = `${prefix('export_events')}/corrupt.parquet`;
                await s3.putObject({
                    Bucket: storage.bucket,
                    Key: corruptKey,
                    Body: 'broken',
                });
                await expect(compact()).rejects.toThrow(
                    'User activity: 1 partitions failed',
                );
                expect(
                    (await s3.headObject({ Bucket: storage.bucket, Key: key }))
                        .ETag,
                ).toBe(good.ETag);
                await s3.deleteObject({
                    Bucket: storage.bucket,
                    Key: corruptKey,
                });
                // Recovery works without replaying already-deleted raw events.
                await s3.deleteObject({ Bucket: storage.bucket, Key: key });
                expect((await compact()).users).toMatchObject({
                    published: 1,
                    unchanged: 5,
                    failed: 0,
                });
                const cli = await promisify(execFile)(
                    'pnpm',
                    [
                        'exec',
                        'tsx',
                        '--tsconfig',
                        'tsconfig.scripts.json',
                        'src/scripts/build-usage-user-activity.ts',
                        '--org-id',
                        org,
                        '--from',
                        date,
                        '--to',
                        date,
                    ],
                    {
                        env: {
                            ...process.env,
                            S3_ENDPOINT: endpoint,
                            S3_BUCKET: storage.bucket,
                            S3_REGION: storage.region,
                            S3_ACCESS_KEY: storage.accessKey,
                            S3_SECRET_KEY: storage.secretKey,
                            S3_AUTH_MODE: 'default',
                            S3_FORCE_PATH_STYLE: 'true',
                            USAGE_EVENTS_S3_ENDPOINT: endpoint,
                            USAGE_EVENTS_S3_BUCKET: storage.bucket,
                            USAGE_EVENTS_S3_REGION: storage.region,
                            USAGE_EVENTS_S3_ACCESS_KEY: storage.accessKey,
                            USAGE_EVENTS_S3_SECRET_KEY: storage.secretKey,
                        },
                        timeout: 120000,
                    },
                );
                expect(cli.stdout).toContain('unchanged: 5');
                // Other org has no query/AI/app/step files: its empty views still query.
                const otherReader = new DuckdbWarehouseClient({
                    type: 'duckdb_parquet',
                    resolveSource: createS3AnalyticsSourceResolver({
                        storage,
                        organizationUuid: otherOrg,
                    }),
                });
                expect(
                    (
                        await otherReader.runQuery(
                            'SELECT sum(event_count)::INTEGER AS total FROM user_activity',
                        )
                    ).rows,
                ).toEqual([{ total: 1 }]);
                expect(
                    (
                        await otherReader.runQuery(
                            'SELECT count(*)::INTEGER AS total FROM query_events',
                        )
                    ).rows,
                ).toEqual([{ total: 0 }]);
                await s3.putObject({
                    Bucket: storage.bucket,
                    Key: `events/raw/org_id=${org}/stream=export_events/dt=${date}/pending.jsonl.gz`,
                    Body: 'pending',
                });
                await expect(
                    new UsageUserActivityBuilder(storage).run(
                        org,
                        date,
                        date,
                        now,
                    ),
                ).rejects.toThrow('still awaits compaction');
                // No writer ever edits compacted events.
                expect(
                    (
                        await s3.headObject({
                            Bucket: storage.bucket,
                            Key: `${prefix('query_events')}/load.parquet`,
                        })
                    ).ContentLength,
                ).toBeGreaterThan(0);
            } finally {
                let page;
                do {
                    // eslint-disable-next-line no-await-in-loop
                    page = await s3.listObjectsV2({ Bucket: storage.bucket });
                    if (page.Contents?.length)
                        // eslint-disable-next-line no-await-in-loop
                        await s3.deleteObjects({
                            Bucket: storage.bucket,
                            Delete: {
                                Objects: page.Contents.map(({ Key }) => ({
                                    Key,
                                })),
                            },
                        });
                } while (page.IsTruncated);
                await s3.deleteBucket({ Bucket: storage.bucket });
                s3.destroy();
            }
        }, 600000);
    },
);
