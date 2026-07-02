import Logger from '../../logging/logger';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { queryEventsCompactedColumns } from './queryEventsStream';
import {
    buildCompactionSql,
    buildPartFileName,
    DELETE_MAX_ATTEMPTS,
    groupRawKeysIntoPartitions,
    parseRawKey,
    UsageEventsCompactor,
} from './UsageEventsCompactor';

vi.mock('../../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const s3Mocks = vi.hoisted(() => {
    const listObjectsV2 = vi.fn();
    const deleteObjects = vi.fn();
    class FakeS3 {
        listObjectsV2 = listObjectsV2;

        deleteObjects = deleteObjects;
    }
    return { listObjectsV2, deleteObjects, FakeS3 };
});

vi.mock('@aws-sdk/client-s3', () => ({
    S3: s3Mocks.FakeS3,
}));

const duckdbMocks = vi.hoisted(() => {
    const runSqlWithMetrics = vi.fn();
    class FakeDuckdbWarehouseClient {
        runSqlWithMetrics = runSqlWithMetrics;
    }
    return { runSqlWithMetrics, FakeDuckdbWarehouseClient };
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
    incrementUsageEventsCompactedPartitions: vi.fn(),
    incrementUsageEventsCompactionFailures: vi.fn(),
    observeUsageEventsCompactionRunDuration: vi.fn(),
    observeUsageEventsCompactionPartition: vi.fn(),
    setUsageEventsCompactionBacklog: vi.fn(),
});

type MetricsMock = ReturnType<typeof createMetricsMock>;

const createCompactor = (metrics: MetricsMock) =>
    new UsageEventsCompactor({
        s3Config,
        prometheusMetrics: metrics as unknown as PrometheusMetrics,
    });

const mockListedKeys = (keys: string[]) => {
    s3Mocks.listObjectsV2.mockResolvedValue({
        Contents: keys.map((Key) => ({ Key })),
        IsTruncated: false,
    });
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
                '"dashboard_id", "cache_hit", "execution_source", "warehouse_type", ' +
                '"warehouse_execution_time_ms", "total_row_count", "columns_count" ' +
                "FROM read_json(['s3://events-bucket/events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/a.jsonl.gz', " +
                "'s3://events-bucket/events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/b.jsonl.gz'], " +
                "format='newline_delimited', " +
                'columns={"event_name": \'VARCHAR\', "org_id": \'VARCHAR\', "user_id": \'VARCHAR\', ' +
                '"event_ts": \'TIMESTAMP\', "schema_version": \'INTEGER\', "project_id": \'VARCHAR\', ' +
                '"query_id": \'VARCHAR\', "status": \'VARCHAR\', "context": \'VARCHAR\', ' +
                '"explore_name": \'VARCHAR\', "chart_id": \'VARCHAR\', "dashboard_id": \'VARCHAR\', ' +
                '"cache_hit": \'BOOLEAN\', "execution_source": \'VARCHAR\', "warehouse_type": \'VARCHAR\', ' +
                '"warehouse_execution_time_ms": \'BIGINT\', ' +
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
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('never deletes raw files when the compaction write fails', async () => {
        duckdbMocks.runSqlWithMetrics.mockRejectedValue(
            new Error('duckdb exploded'),
        );
        mockListedKeys([rawKey('org-1', 'query_events', '2026-07-01')]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary.partitionsFailed).toEqual(1);
        expect(summary.partitionsCompacted).toEqual(0);
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
        expect(
            metrics.observeUsageEventsCompactionRunDuration,
        ).toHaveBeenCalledWith(expect.any(Number), 'partial');
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining('duckdb exploded'),
        );
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
            expect.stringContaining('deleted manually'),
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
    });
});
