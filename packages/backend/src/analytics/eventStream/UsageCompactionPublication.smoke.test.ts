import { S3 } from '@aws-sdk/client-s3';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { UsageEventsCompactor } from './UsageEventsCompactor';

// Disposable MinIO bucket only. No production storage or customer data.
describe.skipIf(!process.env.USAGE_COMPACTION_SMOKE)(
    'canceled native compaction publication',
    () => {
        it('keeps raw inputs and pending manifest after native interruption, then recovers', async () => {
            const storage = {
                endpoint: 'http://127.0.0.1:9000',
                bucket: `usage-lease-${randomUUID()}`,
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
            const rawKey = `events/raw/org_id=${org}/stream=query_events/dt=2026-10-28/input.jsonl.gz`;
            const controller = new AbortController();
            const makeCompactor = (signal?: AbortSignal) =>
                new UsageEventsCompactor({
                    s3Config: storage,
                    signal,
                    prometheusMetrics: null,
                    featureFlagModel: {
                        get: async () => ({
                            id: 'analytics-project',
                            enabled: true,
                        }),
                    },
                    usageDimensionsModel: {
                        async *getOrganizations() {
                            yield {
                                organization_id: 1,
                                organization_uuid: org,
                            };
                        },
                        async *getJsonLines() {},
                    },
                });
            const native = new DuckdbWarehouseClient(
                {
                    type: 'duckdb_s3',
                    s3Config: getDuckdbRuntimeConfig(storage)!,
                },
                { resourceLimits: { memoryLimit: '256MB', threads: 1 } },
            );
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                await s3.createBucket({ Bucket: storage.bucket });
                await s3.putObject({
                    Bucket: storage.bucket,
                    Key: rawKey,
                    Body: gzipSync(
                        `${JSON.stringify({ org_id: org, user_id: 'person', project_id: 'project', event_name: 'query.completed', event_ts: '2026-10-28T12:00:00Z', query_id: 'query', schema_version: 1 })}\n`,
                    ),
                });
                // Warm native bootstrap; interruption then happens during COPY itself.
                await native.runSqlWithMetrics('SELECT 1');
                const runSql = native.runSqlWithMetrics.bind(native);
                vi.spyOn(native, 'runSqlWithMetrics').mockImplementation(
                    async (sql, options) => {
                        const output = /TO '([^']+)'/.exec(sql)?.[1];
                        expect(output).toContain('usage-compaction-');
                        expect(output).not.toContain('s3://');
                        timer = setTimeout(
                            () => controller.abort(new Error('lease lost')),
                            200,
                        );
                        return runSql(
                            `COPY (SELECT i, md5(i::VARCHAR) AS payload FROM range(1000000000) t(i)) TO '${output}' (FORMAT PARQUET)`,
                            options,
                        );
                    },
                );
                const compactor = makeCompactor(controller.signal);
                vi.spyOn(
                    compactor as unknown as {
                        createDuckdbClient: () => DuckdbWarehouseClient;
                    },
                    'createDuckdbClient',
                ).mockReturnValue(native);
                await expect(
                    compactor.run(new Date('2026-10-29T00:30:00Z')),
                ).rejects.toThrow();
                expect(controller.signal.aborted).toBe(true);
                const keys =
                    (
                        await s3.listObjectsV2({ Bucket: storage.bucket })
                    ).Contents?.map(({ Key }) => Key) ?? [];
                expect(keys).toContain(rawKey);
                expect(keys.some((key) => key?.endsWith('/pending.json'))).toBe(
                    true,
                );
                expect(
                    keys.some((key) => key?.startsWith('events/compacted/')),
                ).toBe(false);
                await makeCompactor().run(new Date('2026-10-29T00:30:00Z'));
                const recovered =
                    (
                        await s3.listObjectsV2({ Bucket: storage.bucket })
                    ).Contents?.map(({ Key }) => Key) ?? [];
                expect(recovered).not.toContain(rawKey);
                expect(
                    recovered.some((key) => key?.endsWith('/pending.json')),
                ).toBe(false);
                expect(
                    recovered.filter(
                        (key) =>
                            key?.startsWith('events/compacted/') &&
                            key.includes('/stream=query_events/') &&
                            /\/part-[a-f0-9]+\.parquet$/.test(key),
                    ),
                ).toHaveLength(1);
            } finally {
                clearTimeout(timer);
                vi.restoreAllMocks();
                const objects =
                    (await s3.listObjectsV2({ Bucket: storage.bucket }))
                        .Contents ?? [];
                if (objects.length)
                    await s3.deleteObjects({
                        Bucket: storage.bucket,
                        Delete: {
                            Objects: objects.map(({ Key }) => ({ Key })),
                        },
                    });
                await s3.deleteBucket({ Bucket: storage.bucket });
                s3.destroy();
            }
        }, 60_000);
    },
);
