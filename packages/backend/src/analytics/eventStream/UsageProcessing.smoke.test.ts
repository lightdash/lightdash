import { DeleteObjectsCommand, S3 } from '@aws-sdk/client-s3';
import { FeatureFlags } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { randomUUID } from 'crypto';
import knex from 'knex';
import { gzipSync } from 'zlib';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { createS3AnalyticsSourceResolver } from '../../services/ProjectService/analyticsProject/S3AnalyticsSource';
import { createEventStreamWriter } from './createEventStreamWriter';
import { UsageEventsCompactor } from './UsageEventsCompactor';

// Opt-in: isolated local Postgres, native DuckDB and a disposable MinIO bucket.
describe.skipIf(!process.env.USAGE_PROCESSING_SMOKE_PGPORT)(
    'organization usage processing live locally',
    () => {
        it('gates capture and all stages, bounds history, and recovers partial cleanup without duplicates', async () => {
            vi.unstubAllGlobals();
            const schema = `usage_policy_${randomUUID().replaceAll('-', '')}`;
            const db = knex({
                client: 'pg',
                connection: {
                    host: '127.0.0.1',
                    port: Number(process.env.USAGE_PROCESSING_SMOKE_PGPORT),
                    user: process.env.PGUSER,
                    password: process.env.PGPASSWORD,
                    database: 'postgres',
                },
                searchPath: [schema],
                pool: { min: 0, max: 2 },
            });
            const storage = {
                endpoint: 'http://127.0.0.1:9000',
                bucket: `usage-policy-${randomUUID()}`,
                region: 'us-east-1',
                accessKey: process.env.USAGE_EVENTS_S3_ACCESS_KEY!,
                secretKey: process.env.USAGE_EVENTS_S3_SECRET_KEY!,
                forcePathStyle: true,
            };
            const s3 = new S3({
                ...storage,
                credentials: {
                    accessKeyId: storage.accessKey,
                    secretAccessKey: storage.secretKey,
                },
            });
            const org = randomUUID();
            const otherOrg = randomUUID();
            const now = new Date('2026-10-08T00:30:00Z');
            let clock = Date.now();
            vi.spyOn(Date, 'now').mockImplementation(() => clock);
            const config = {
                ...lightdashConfigMock,
                enabledFeatureFlags: new Set<string>(),
                disabledFeatureFlags: new Set<string>(),
                previewFeatureFlags: {
                    ...lightdashConfigMock.previewFeatureFlags,
                    enabled: false,
                },
                usageEvents: {
                    ...lightdashConfigMock.usageEvents,
                    enabled: true,
                    s3: storage,
                    flushBatchSize: 100000,
                    bufferMaxSize: 100000,
                },
            };
            const flags = new FeatureFlagModel({
                database: db,
                lightdashConfig: config,
            });
            const get = vi.spyOn(flags, 'get');
            const metrics = {
                incrementUsageEventsPushed: vi.fn(),
                incrementUsageEventsFlushed: vi.fn(),
                incrementUsageEventsRawPuts: vi.fn(),
                incrementUsageEventsDropped: vi.fn(),
                incrementUsageEventsPutFailure: vi.fn(),
            } as unknown as PrometheusMetrics;
            const writer = createEventStreamWriter(
                config,
                metrics,
                () => flags,
            )!;
            const dimensionsRead: string[] = [];
            const model = {
                async *getOrganizations() {
                    yield { organization_id: 1, organization_uuid: org };
                    yield { organization_id: 2, organization_uuid: otherOrg };
                },
                async *getJsonLines(organization: {
                    organization_uuid: string;
                }) {
                    dimensionsRead.push(organization.organization_uuid);
                    yield* [];
                },
            };
            const run = () =>
                new UsageEventsCompactor({
                    s3Config: storage,
                    prometheusMetrics: null,
                    usageDimensionsModel: model,
                    featureFlagModel: flags,
                }).run(now);
            const event = (orgId: string, date = '2026-10-07') => ({
                org_id: orgId,
                user_id: 'test-user',
                project_id: 'test-project',
                event_ts: `${date}T12:00:00Z`,
                event_name: 'query.completed',
                query_id: randomUUID(),
                schema_version: 1,
            });
            const list = async (prefix = '') =>
                (
                    await s3.listObjectsV2({
                        Bucket: storage.bucket,
                        Prefix: prefix,
                    })
                ).Contents ?? [];
            const reader = new DuckdbWarehouseClient({
                type: 'duckdb_parquet',
                resolveSource: createS3AnalyticsSourceResolver({
                    storage,
                    organizationUuid: org,
                }),
            });
            const total = async (table: string, expression: string) =>
                Number(
                    (
                        await reader.runQuery(
                            `SELECT ${expression} AS total FROM ${table}`,
                        )
                    ).rows[0].total,
                );
            let created = false;
            try {
                await db.raw('CREATE SCHEMA ??', [schema]);
                await db.raw(
                    'CREATE TABLE feature_flags (flag_id text PRIMARY KEY, default_enabled boolean); CREATE TABLE feature_flag_overrides (flag_id text, organization_uuid uuid, user_uuid uuid, enabled boolean)',
                );
                await db('feature_flags').insert({
                    flag_id: FeatureFlags.AnalyticsProject,
                    default_enabled: false,
                });
                await db('feature_flag_overrides').insert([
                    {
                        flag_id: FeatureFlags.AnalyticsProject,
                        organization_uuid: org,
                        enabled: false,
                    },
                    {
                        flag_id: FeatureFlags.AnalyticsProject,
                        organization_uuid: otherOrg,
                        enabled: false,
                    },
                ]);
                await s3.createBucket({ Bucket: storage.bucket });
                created = true;
                writer.push('query_events', event(org));
                writer.push('query_events', event(otherOrg));
                await writer.flush();
                expect(await list()).toHaveLength(0);
                expect((await run()).dimensions.refreshed).toBe(0);
                expect(dimensionsRead).toEqual([]);
                await db('feature_flag_overrides')
                    .where({ organization_uuid: org })
                    .update({ enabled: true });
                clock += 60001;
                get.mockClear();
                const captureStart = performance.now();
                for (let index = 0; index < 10000; index += 1) {
                    writer.push(
                        'query_events',
                        event(org, index % 2 ? '2026-10-01' : '2026-10-07'),
                    );
                    writer.push('query_events', event(otherOrg));
                }
                writer.push('query_events', event(org, '2026-09-30'));
                writer.push('query_events', event(org, '2026-10-08'));
                await writer.flush();
                const captureMs = performance.now() - captureStart;
                expect(get).toHaveBeenCalledTimes(2);
                expect(
                    await list(`events/raw/org_id=${otherOrg}/`),
                ).toHaveLength(0);
                const runStart = performance.now();
                const summary = await run();
                const processingMs = performance.now() - runStart;
                expect(summary).toMatchObject({
                    partitionsCompacted: 2,
                    partitionsFailed: 0,
                    dimensions: { refreshed: 6, failed: 0 },
                    users: { published: 2, failed: 0 },
                });
                expect(new Set(dimensionsRead)).toEqual(new Set([org]));
                expect(await total('query_events', 'count(*)')).toBe(10000);
                expect(await total('user_activity', 'sum(event_count)')).toBe(
                    10000,
                );
                expect(await list(`events/raw/org_id=${org}/`)).toHaveLength(2); // current day and day eight
                expect((await run()).users).toMatchObject({
                    published: 0,
                    unchanged: 2,
                });

                const putRaw = async (count: number) => {
                    const keys: string[] = [];
                    for (let index = 0; index < count; index += 1) {
                        const key = `events/raw/org_id=${org}/stream=query_events/dt=2026-10-07/${randomUUID()}.jsonl.gz`;
                        // eslint-disable-next-line no-await-in-loop -- Publish distinct fault-injection input objects.
                        await s3.putObject({
                            Bucket: storage.bucket,
                            Key: key,
                            Body: gzipSync(`${JSON.stringify(event(org))}\n`),
                        });
                        keys.push(key);
                    }
                    return keys;
                };
                const recoveryKeys = await putRaw(10);
                let firstDelete = true;
                const deletion = vi
                    .spyOn(S3.prototype, 'deleteObjects')
                    .mockImplementation(async (input) => {
                        if (input.Bucket !== storage.bucket)
                            throw new Error('Unexpected bucket');
                        const objects = input.Delete!.Objects!;
                        const remove = firstDelete ? objects.slice(0, 5) : [];
                        firstDelete = false;
                        if (remove.length)
                            await s3.send(
                                new DeleteObjectsCommand({
                                    ...input,
                                    Delete: { Objects: remove },
                                }),
                            );
                        return {
                            Errors: objects
                                .filter((object) => !remove.includes(object))
                                .map((object) => ({
                                    Key: object.Key,
                                    Code: 'InternalError',
                                    Message: 'synthetic failure',
                                })),
                        } as never;
                    });
                expect((await run()).partitionsFailed).toBe(1);
                expect(await total('query_events', 'count(*)')).toBe(10010);
                deletion.mockRestore();
                expect((await run()).partitionsFailed).toBe(0);
                expect(await total('query_events', 'count(*)')).toBe(10010);
                expect(await total('user_activity', 'sum(event_count)')).toBe(
                    10010,
                );
                expect(
                    (await list('events/raw/')).some((item) =>
                        recoveryKeys.includes(item.Key!),
                    ),
                ).toBe(false);

                // Failure after publication but before any cleanup, then a late arrival.
                await putRaw(10);
                const crash = vi
                    .spyOn(S3.prototype, 'deleteObjects')
                    .mockRejectedValue(new Error('synthetic interruption'));
                expect((await run()).partitionsFailed).toBe(1);
                crash.mockRestore();
                await putRaw(1);
                await run();
                await run();
                expect(await total('query_events', 'count(*)')).toBe(10021);
                expect(await total('user_activity', 'sum(event_count)')).toBe(
                    10021,
                );
                expect(await list('events/compaction/')).toHaveLength(0);
                // Disable on an existing process: capture cache expires; processing rechecks immediately.
                await db('feature_flag_overrides')
                    .where({ organization_uuid: org })
                    .update({ enabled: false });
                const before = (await list()).length;
                clock += 60001;
                writer.push('query_events', event(org));
                await writer.flush();
                dimensionsRead.length = 0;
                expect((await run()).dimensions.refreshed).toBe(0);
                expect(dimensionsRead).toEqual([]);
                expect((await list()).length).toBe(before);
                process.stdout.write(
                    `${JSON.stringify({
                        captureInputEvents: 20002,
                        capturedEvents: 10002,
                        eligibleEvents: 10000,
                        captureMs,
                        processingMs,
                        recoveredTotal: 10021,
                        flagLookupsPerFlush: 2,
                    })}\n`,
                );
            } finally {
                vi.restoreAllMocks();
                await writer.close();
                if (created) {
                    for (const object of await list())
                        // eslint-disable-next-line no-await-in-loop -- Cleanup only this disposable fixture.
                        await s3.deleteObject({
                            Bucket: storage.bucket,
                            Key: object.Key!,
                        });
                    await s3.deleteBucket({ Bucket: storage.bucket });
                }
                s3.destroy();
                await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
                await db.destroy();
            }
        }, 60000);
    },
);
