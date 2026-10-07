import prometheus from 'prom-client';
import Logger from '../../logging/logger';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { UsageProcessingMetrics } from '../../prometheus/UsageProcessingMetrics';
import { queryEventsCompactedColumns } from './queryEventsStream';
import { UsageDimensionsRefresher } from './UsageDimensionsRefresher';
import {
    buildCompactionSql,
    buildPartFileName,
    DELETE_MAX_ATTEMPTS,
    groupRawKeysIntoPartitions,
    parseRawKey,
    UsageEventsCompactor,
} from './UsageEventsCompactor';
import { UsageUserActivityBuilder } from './UsageUserActivityBuilder';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock('../../clients/Aws/gcpOAuth', () => ({
    applyGcpOAuth: vi.fn(),
    getGcpAccessToken: vi.fn(),
}));

const s3Mocks = vi.hoisted(() => {
    const listObjectsV2 = vi.fn();
    const deleteObjects = vi.fn();
    const getObject = vi.fn();
    const putObject = vi.fn();
    const headObject = vi.fn();
    const deleteObject = vi.fn();
    class FakeS3 {
        getObject = getObject;
        putObject = putObject;
        headObject = headObject;
        deleteObject = deleteObject;
        listObjectsV2 = listObjectsV2;

        deleteObjects = deleteObjects;

        destroy = vi.fn();
    }
    return {
        listObjectsV2,
        deleteObjects,
        getObject,
        putObject,
        headObject,
        deleteObject,
        FakeS3,
    };
});

vi.mock('@aws-sdk/client-s3', () => ({
    S3: s3Mocks.FakeS3,
}));

const duckdbMocks = vi.hoisted(() => {
    const runSqlWithMetrics = vi.fn();
    const constructor = vi.fn();
    class FakeDuckdbWarehouseClient {
        runSqlWithMetrics = runSqlWithMetrics;

        constructor(...args: unknown[]) {
            constructor(...args);
        }
    }
    return { runSqlWithMetrics, FakeDuckdbWarehouseClient, constructor };
});

vi.mock('@lightdash/warehouses', () => ({
    DuckdbWarehouseClient: duckdbMocks.FakeDuckdbWarehouseClient,
}));

const s3Config = {
    endpoint: 'https://s3.example.com',
    region: 'us-east-1',
    bucket: 'events-bucket',
    accessKey: 'AKIA',
    secretKey: 'SECRET',
    forcePathStyle: true,
};

const NOW = new Date('2026-07-02T10:00:00.000Z');

const rawKey = (
    orgId: string,
    stream: string,
    dt: string,
    file = 'writer01-file-1.jsonl.gz',
) => `events/raw/org_id=${orgId}/stream=${stream}/dt=${dt}/${file}`;

const createMetricsMock = () => ({
    usageProcessing: { start: vi.fn(), finish: vi.fn() },
    incrementUsageEventsCompactedPartitions: vi.fn(),
    incrementUsageEventsCompactionFailures: vi.fn(),
    observeUsageEventsCompactionRunDuration: vi.fn(),
    observeUsageEventsCompactionPartition: vi.fn(),
    setUsageEventsCompactionBacklog: vi.fn(),
    setUsageEventsRawObjects: vi.fn(),
});

let listedOrgs = ['org-1'];

type MetricsMock = ReturnType<typeof createMetricsMock>;

const createCompactor = (metrics: MetricsMock) =>
    new UsageEventsCompactor({
        featureFlagModel: {
            get: async () => ({ id: 'analytics-project', enabled: true }),
        },
        s3Config,
        usageDimensionsModel: {
            async *getOrganizations() {
                for (const [index, id] of listedOrgs.entries())
                    yield { organization_id: index + 1, organization_uuid: id };
            },
            async *getJsonLines() {},
        },
        prometheusMetrics: metrics as unknown as PrometheusMetrics,
    });

const mockListedKeys = (keys: string[]) => {
    listedOrgs = [
        ...new Set([
            'org-1',
            ...keys
                .map((key) => parseRawKey(key)?.orgId)
                .filter((id): id is string => !!id),
        ]),
    ];
    s3Mocks.listObjectsV2.mockImplementation(async ({ Prefix }) => ({
        Contents: keys
            .filter((key) => key.startsWith(Prefix))
            .map((Key) => ({ Key })),
        IsTruncated: false,
    }));
};

describe('parseRawKey', () => {
    it('parses a valid raw zone key', () => {
        expect(
            parseRawKey(rawKey('org-1', 'query_events', '2026-07-01')),
        ).toEqual({
            orgId: 'org-1',
            stream: 'query_events',
            dt: '2026-07-01',
            key: rawKey('org-1', 'query_events', '2026-07-01'),
        });
    });

    it('returns null for keys outside the raw layout', () => {
        expect(
            parseRawKey('events/raw/org_id=org-1/loose.jsonl.gz'),
        ).toBeNull();
        expect(
            parseRawKey(
                'events/compacted/org_id=org-1/stream=query_events/dt=2026-07-01/part-x.parquet',
            ),
        ).toBeNull();
        expect(
            parseRawKey(
                'events/raw/org_id=org-1/stream=query_events/dt=2026-7-1/file.jsonl.gz',
            ),
        ).toBeNull();
        expect(
            parseRawKey(
                'events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/file.parquet',
            ),
        ).toBeNull();
    });
});

describe('groupRawKeysIntoPartitions', () => {
    it('groups keys by partition and excludes today and future dates', () => {
        const partitions = groupRawKeysIntoPartitions(
            [
                rawKey('org-1', 'query_events', '2026-07-01', 'a.jsonl.gz'),
                rawKey('org-1', 'query_events', '2026-07-01', 'b.jsonl.gz'),
                rawKey('org-2', 'query_events', '2026-06-30'),
                rawKey('org-1', 'other_stream', '2026-07-01'),
                rawKey('org-1', 'query_events', '2026-07-02'), // open day
                rawKey('org-1', 'query_events', '2026-07-03'), // future
                'events/raw/not-a-partition.jsonl.gz',
            ],
            '2026-07-02',
        );

        expect(partitions).toEqual([
            {
                orgId: 'org-2',
                stream: 'query_events',
                dt: '2026-06-30',
                keys: [rawKey('org-2', 'query_events', '2026-06-30')],
            },
            {
                orgId: 'org-1',
                stream: 'other_stream',
                dt: '2026-07-01',
                keys: [rawKey('org-1', 'other_stream', '2026-07-01')],
            },
            {
                orgId: 'org-1',
                stream: 'query_events',
                dt: '2026-07-01',
                keys: [
                    rawKey('org-1', 'query_events', '2026-07-01', 'a.jsonl.gz'),
                    rawKey('org-1', 'query_events', '2026-07-01', 'b.jsonl.gz'),
                ],
            },
        ]);
    });
});

describe('buildPartFileName', () => {
    it('is deterministic and independent of input order', () => {
        const keys = ['k/b.jsonl.gz', 'k/a.jsonl.gz'];
        expect(buildPartFileName(keys)).toEqual(
            buildPartFileName([...keys].reverse()),
        );
        expect(buildPartFileName(keys)).toMatch(/^part-[0-9a-f]{40}\.parquet$/);
    });

    it('changes when the input file set changes', () => {
        expect(buildPartFileName(['k/a.jsonl.gz'])).not.toEqual(
            buildPartFileName(['k/a.jsonl.gz', 'k/b.jsonl.gz']),
        );
    });
});

describe('buildCompactionSql', () => {
    it('builds a typed COPY from the exact raw files to a deterministic parquet part', () => {
        const partition = {
            orgId: 'org-1',
            stream: 'query_events',
            dt: '2026-07-01',
            keys: [
                rawKey('org-1', 'query_events', '2026-07-01', 'a.jsonl.gz'),
                rawKey('org-1', 'query_events', '2026-07-01', 'b.jsonl.gz'),
            ],
        };
        const { sql, compactedKey } = buildCompactionSql({
            bucket: 'events-bucket',
            partition,
            columns: queryEventsCompactedColumns,
        });

        expect(compactedKey).toEqual(
            `events/compacted/org_id=org-1/stream=query_events/dt=2026-07-01/${buildPartFileName(
                partition.keys,
            )}`,
        );
        expect(sql).toEqual(
            'COPY (SELECT "event_name", "org_id", "user_id", "event_ts", "schema_version", ' +
                '"project_id", "query_id", "status", "context", "explore_name", "chart_id", ' +
                '"dashboard_id", "response_time_ms", "response_timing_basis", "workload_origin", "dashboard_tile_id", "app_id", "app_version", "request_id", "parent_operation_id", "initiating_actor_type", "scheduler_id", "semantic_lineage_status", "semantic_field_references", "cache_hit", "execution_source", "warehouse_type", ' +
                '"connection_warehouse_type", "warehouse_connection_id", "connection_kind", "connection_count", ' +
                '"warehouse_execution_time_ms", "warehouse_ssh_tunnel_ms", ' +
                '"warehouse_connect_ms", "warehouse_session_ms", "warehouse_query_ms", ' +
                '"warehouse_fetch_ms", "total_row_count", "columns_count" ' +
                "FROM read_json(['s3://events-bucket/events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/a.jsonl.gz', " +
                "'s3://events-bucket/events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/b.jsonl.gz'], " +
                "format='newline_delimited', " +
                'columns={"event_name": \'VARCHAR\', "org_id": \'VARCHAR\', "user_id": \'VARCHAR\', ' +
                '"event_ts": \'TIMESTAMP\', "schema_version": \'INTEGER\', "project_id": \'VARCHAR\', ' +
                '"query_id": \'VARCHAR\', "status": \'VARCHAR\', "context": \'VARCHAR\', ' +
                '"explore_name": \'VARCHAR\', "chart_id": \'VARCHAR\', "dashboard_id": \'VARCHAR\', ' +
                '"response_time_ms": \'BIGINT\', "response_timing_basis": \'VARCHAR\', "workload_origin": \'VARCHAR\', "dashboard_tile_id": \'VARCHAR\', "app_id": \'VARCHAR\', "app_version": \'INTEGER\', "request_id": \'VARCHAR\', "parent_operation_id": \'VARCHAR\', "initiating_actor_type": \'VARCHAR\', "scheduler_id": \'VARCHAR\', ' +
                '"semantic_lineage_status": \'VARCHAR\', "semantic_field_references": \'VARCHAR\', ' +
                '"cache_hit": \'BOOLEAN\', "execution_source": \'VARCHAR\', "warehouse_type": \'VARCHAR\', ' +
                '"connection_warehouse_type": \'VARCHAR\', "warehouse_connection_id": \'VARCHAR\', "connection_kind": \'VARCHAR\', "connection_count": \'INTEGER\', ' +
                '"warehouse_execution_time_ms": \'BIGINT\', ' +
                '"warehouse_ssh_tunnel_ms": \'BIGINT\', "warehouse_connect_ms": \'BIGINT\', ' +
                '"warehouse_session_ms": \'BIGINT\', "warehouse_query_ms": \'BIGINT\', ' +
                '"warehouse_fetch_ms": \'BIGINT\', ' +
                '"total_row_count": \'BIGINT\', "columns_count": \'INTEGER\'})) ' +
                `TO 's3://events-bucket/${compactedKey}' (FORMAT PARQUET, COMPRESSION zstd)`,
        );
    });
});

describe('UsageEventsCompactor.run', () => {
    let metrics: MetricsMock;

    beforeEach(() => {
        vi.clearAllMocks();
        metrics = createMetricsMock();
        duckdbMocks.runSqlWithMetrics.mockResolvedValue({
            bootstrapMs: 1,
            queryMs: 1,
            totalMs: 2,
        });
        s3Mocks.deleteObjects.mockResolvedValue({});
        s3Mocks.getObject.mockRejectedValue({
            $metadata: { httpStatusCode: 404 },
        });
        s3Mocks.headObject.mockRejectedValue({
            $metadata: { httpStatusCode: 404 },
        });
        s3Mocks.putObject.mockResolvedValue({});
        s3Mocks.deleteObject.mockResolvedValue({});
        vi.spyOn(UsageDimensionsRefresher.prototype, 'run').mockResolvedValue({
            refreshed: 0,
            failed: 0,
        });
        vi.spyOn(
            UsageUserActivityBuilder.prototype,
            'runAll',
        ).mockResolvedValue({
            published: 0,
            unchanged: 0,
            skipped: 0,
            failed: 0,
            deferred: 0,
            limitReached: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('never deletes raw files when the compaction write fails', async () => {
        duckdbMocks.runSqlWithMetrics.mockRejectedValue(
            new Error('duckdb exploded'),
        );
        mockListedKeys([rawKey('org-1', 'query_events', '2026-07-01')]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary.partitionsFailed).toEqual(1);
        expect(summary.partitionsCompacted).toEqual(0);
        expect(metrics.usageProcessing.finish).toHaveBeenCalledWith(
            'pipeline',
            { outcome: 'failed' },
            expect.any(Number),
        );
        expect(s3Mocks.deleteObjects).not.toHaveBeenCalled();
        expect(
            metrics.incrementUsageEventsCompactionFailures,
        ).toHaveBeenCalledTimes(1);
        expect(
            metrics.observeUsageEventsCompactionPartition,
        ).toHaveBeenCalledWith(
            expect.any(Number),
            'failed',
            expect.any(Number),
        );
        // Failed partition stays in the backlog for the next run
        expect(metrics.setUsageEventsCompactionBacklog).toHaveBeenCalledWith(1);
        expect(metrics.setUsageEventsRawObjects).toHaveBeenCalledWith(1);
        expect(
            metrics.observeUsageEventsCompactionRunDuration,
        ).toHaveBeenCalledWith(expect.any(Number), 'partial');
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining('duckdb exploded'),
        );
    });

    it('uses GCS paths and token resolution for workload identity compaction', async () => {
        const key = rawKey('org-1', 'query_events', '2026-07-01');
        mockListedKeys([key]);
        const compactor = new UsageEventsCompactor({
            featureFlagModel: {
                get: async () => ({ id: 'analytics-project', enabled: true }),
            },
            s3Config: {
                endpoint: 'https://storage.googleapis.com',
                bucket: 'events-bucket',
                region: 'us-east-1',
                forcePathStyle: true,
                authMode: 'gcp_oauth',
            },
            prometheusMetrics: null,
            usageDimensionsModel: {
                async *getOrganizations() {
                    for (const [index, id] of listedOrgs.entries())
                        yield {
                            organization_id: index + 1,
                            organization_uuid: id,
                        };
                },
                async *getJsonLines() {},
            },
        });
        const summary = await compactor.run(NOW);
        expect(summary.partitionsCompacted).toBe(1);
        const sql = duckdbMocks.runSqlWithMetrics.mock.calls[0][0];
        expect(sql).toContain(`read_json(['gs://events-bucket/${key}']`);
        expect(sql).toContain("TO 'gs://events-bucket/events/compacted/");
        expect(sql).not.toContain('s3://');
        expect(duckdbMocks.constructor).toHaveBeenCalledWith(
            expect.objectContaining({
                s3Config: expect.objectContaining({
                    authMode: 'gcp_oauth',
                    getAccessToken: expect.any(Function),
                    scope: ['gs://events-bucket/'],
                }),
            }),
            expect.any(Object),
        );
        expect(s3Mocks.deleteObjects).toHaveBeenCalledOnce();
    });

    it('retries only the raw keys that failed to delete and still compacts the partition', async () => {
        vi.useFakeTimers();
        const keys = [
            rawKey('org-1', 'query_events', '2026-07-01', 'a.jsonl.gz'),
            rawKey('org-1', 'query_events', '2026-07-01', 'b.jsonl.gz'),
        ];
        mockListedKeys(keys);
        s3Mocks.deleteObjects
            .mockResolvedValueOnce({
                Errors: [{ Key: keys[1], Message: 'InternalError' }],
            })
            .mockResolvedValueOnce({});

        const runPromise = createCompactor(metrics).run(NOW);
        await vi.runAllTimersAsync();
        const summary = await runPromise;

        expect(summary.partitionsCompacted).toEqual(1);
        expect(summary.partitionsFailed).toEqual(0);
        expect(summary.rawObjectsDeleted).toEqual(2);
        expect(s3Mocks.deleteObjects).toHaveBeenCalledTimes(2);
        expect(s3Mocks.deleteObjects).toHaveBeenLastCalledWith(
            expect.objectContaining({
                Delete: expect.objectContaining({
                    Objects: [{ Key: keys[1] }],
                }),
            }),
        );
    });

    it('fails the partition with a cleanup warning when delete retries are exhausted', async () => {
        vi.useFakeTimers();
        const key = rawKey('org-1', 'query_events', '2026-07-01');
        mockListedKeys([key]);
        s3Mocks.deleteObjects.mockResolvedValue({
            Errors: [{ Key: key, Message: 'AccessDenied' }],
        });

        const runPromise = createCompactor(metrics).run(NOW);
        await vi.runAllTimersAsync();
        const summary = await runPromise;

        expect(summary.partitionsFailed).toEqual(1);
        expect(summary.partitionsCompacted).toEqual(0);
        expect(s3Mocks.deleteObjects).toHaveBeenCalledTimes(
            DELETE_MAX_ATTEMPTS,
        );
        expect(
            metrics.incrementUsageEventsCompactionFailures,
        ).toHaveBeenCalledTimes(1);
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining('checkpoint is retained'),
        );
    });

    it('excludes unknown-stream partitions from the backlog gauge', async () => {
        mockListedKeys([
            rawKey('org-1', 'query_events', '2026-07-01'),
            rawKey('org-1', 'mystery_stream', '2026-07-01'),
        ]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary.partitionsCompacted).toEqual(1);
        expect(summary.partitionsSkippedUnknownStream).toEqual(1);
        expect(metrics.setUsageEventsCompactionBacklog).toHaveBeenCalledWith(0);
        // Unknown-stream raw object stays in the raw zone
        expect(metrics.setUsageEventsRawObjects).toHaveBeenCalledWith(1);
        expect(metrics.usageProcessing.finish).toHaveBeenCalledWith(
            'pipeline',
            { outcome: 'partial' },
            expect.any(Number),
        );
    });

    it('records every stage of a healthy empty run as complete', async () => {
        mockListedKeys([]);
        const registry = new prometheus.Registry();
        const exportedMetrics = new UsageProcessingMetrics([registry]);
        metrics.usageProcessing.start.mockImplementation((stage) =>
            exportedMetrics.start(stage),
        );
        metrics.usageProcessing.finish.mockImplementation(
            (stage, result, duration) =>
                exportedMetrics.finish(stage, result, duration),
        );
        await createCompactor(metrics).run(NOW);
        expect(metrics.usageProcessing.start.mock.calls).toEqual([
            ['pipeline'],
            ['compaction'],
            ['dimensions'],
            ['users'],
        ]);
        expect(
            metrics.usageProcessing.finish.mock.calls.map(([stage, result]) => [
                stage,
                result.outcome,
            ]),
        ).toEqual([
            ['compaction', 'success'],
            ['dimensions', 'success'],
            ['users', 'success'],
            ['pipeline', 'success'],
        ]);
        const scrape = await registry.metrics();
        for (const stage of ['compaction', 'dimensions', 'users', 'pipeline']) {
            expect(scrape).toContain(
                `lightdash_usage_processing_duration_seconds_count{stage="${stage}",outcome="success"} 1`,
            );
            expect(scrape).toContain(
                `lightdash_usage_processing_running{stage="${stage}"} 0`,
            );
        }
    });

    it.each(['compaction', 'dimensions', 'users'] as const)(
        'preserves thrown %s errors and reports failed pipeline',
        async (stage) => {
            mockListedKeys([]);
            const error = new Error('storage unavailable');
            if (stage === 'compaction')
                s3Mocks.listObjectsV2.mockRejectedValue(error);
            if (stage === 'dimensions')
                vi.spyOn(
                    UsageDimensionsRefresher.prototype,
                    'run',
                ).mockRejectedValue(error);
            if (stage === 'users')
                vi.spyOn(
                    UsageUserActivityBuilder.prototype,
                    'runAll',
                ).mockRejectedValue(error);
            await expect(createCompactor(metrics).run(NOW)).rejects.toBe(error);
            expect(metrics.usageProcessing.finish).toHaveBeenCalledWith(
                stage,
                { outcome: 'failed' },
                expect.any(Number),
            );
            expect(metrics.usageProcessing.finish).toHaveBeenLastCalledWith(
                'pipeline',
                { outcome: 'failed' },
                expect.any(Number),
            );
        },
    );

    it('reports returned dimension failures and still stops before user summaries', async () => {
        mockListedKeys([]);
        vi.spyOn(UsageDimensionsRefresher.prototype, 'run').mockResolvedValue({
            refreshed: 4,
            failed: 1,
        });
        const users = vi.spyOn(UsageUserActivityBuilder.prototype, 'runAll');
        await expect(createCompactor(metrics).run(NOW)).rejects.toThrow(
            'previous snapshots retained',
        );
        expect(users).not.toHaveBeenCalled();
        expect(metrics.usageProcessing.finish).toHaveBeenCalledWith(
            'dimensions',
            { outcome: 'failed', failed: 1, remaining: 1 },
            expect.any(Number),
        );
    });

    it.each([
        { deferred: 1, failed: 0, limitReached: false, outcome: 'partial' },
        { deferred: 0, failed: 0, limitReached: true, outcome: 'partial' },
        { deferred: 0, failed: 1, limitReached: false, outcome: 'failed' },
    ])(
        'reports user summary $outcome without a full-success heartbeat',
        async ({ outcome, ...summary }) => {
            mockListedKeys([]);
            vi.spyOn(
                UsageUserActivityBuilder.prototype,
                'runAll',
            ).mockResolvedValue({
                published: 2,
                unchanged: 1,
                skipped: 0,
                ...summary,
            });
            const run = createCompactor(metrics).run(NOW);
            if (summary.failed)
                await expect(run).rejects.toThrow('previous output retained');
            else await run;
            expect(metrics.usageProcessing.finish).toHaveBeenLastCalledWith(
                'pipeline',
                { outcome },
                expect.any(Number),
            );
        },
    );

    it('reports raw work capped at 500 partitions as partial', async () => {
        mockListedKeys(
            Array.from({ length: 501 }, (_, index) =>
                rawKey(`org-${index}`, 'query_events', '2026-07-01'),
            ),
        );
        const summary = await createCompactor(metrics).run(NOW);
        expect(summary.partitionsCompacted).toBe(500);
        expect(metrics.usageProcessing.finish).toHaveBeenCalledWith(
            'compaction',
            { outcome: 'partial', failed: 0, remaining: 1, limitReached: true },
            expect.any(Number),
        );
        expect(metrics.usageProcessing.finish).toHaveBeenLastCalledWith(
            'pipeline',
            { outcome: 'partial' },
            expect.any(Number),
        );
    });

    it('does not turn successful compaction into a failure when old or new metrics throw', async () => {
        mockListedKeys([rawKey('org-1', 'query_events', '2026-07-01')]);
        metrics.incrementUsageEventsCompactedPartitions.mockImplementation(
            () => {
                throw new Error('counter unavailable');
            },
        );
        metrics.usageProcessing.start.mockImplementation(() => {
            throw new Error('gauge unavailable');
        });
        metrics.usageProcessing.finish.mockImplementation(() => {
            throw new Error('histogram unavailable');
        });
        const summary = await createCompactor(metrics).run(NOW);
        expect(summary).toMatchObject({
            partitionsCompacted: 1,
            partitionsFailed: 0,
        });
        expect(s3Mocks.deleteObjects).toHaveBeenCalledOnce();
    });

    it('does not replace the original processing error when failure metrics throw', async () => {
        const error = new Error('listing failed');
        s3Mocks.listObjectsV2.mockRejectedValue(error);
        metrics.usageProcessing.finish.mockImplementation(() => {
            throw new Error('metrics failed');
        });
        await expect(createCompactor(metrics).run(NOW)).rejects.toBe(error);
    });
});
