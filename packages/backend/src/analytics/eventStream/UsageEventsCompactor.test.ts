import Logger from '../../logging/logger';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { queryEventsCompactedColumns } from './queryEventsStream';
import {
    buildCompactionSql,
    buildPartFileName,
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
                '"project_id", "query_id", "context", "execution_source", "warehouse_type", ' +
                '"cache_hit", "pre_aggregate_hit", "explore_name", "chart_id", "dashboard_id", ' +
                '"sql_chart_id", "warehouse_execution_time_ms", "total_row_count", "columns_count" ' +
                "FROM read_json(['s3://events-bucket/events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/a.jsonl.gz', " +
                "'s3://events-bucket/events/raw/org_id=org-1/stream=query_events/dt=2026-07-01/b.jsonl.gz'], " +
                "format='newline_delimited', " +
                'columns={"event_name": \'VARCHAR\', "org_id": \'VARCHAR\', "user_id": \'VARCHAR\', ' +
                '"event_ts": \'TIMESTAMP\', "schema_version": \'INTEGER\', "project_id": \'VARCHAR\', ' +
                '"query_id": \'VARCHAR\', "context": \'VARCHAR\', "execution_source": \'VARCHAR\', ' +
                '"warehouse_type": \'VARCHAR\', "cache_hit": \'BOOLEAN\', "pre_aggregate_hit": \'BOOLEAN\', ' +
                '"explore_name": \'VARCHAR\', "chart_id": \'VARCHAR\', "dashboard_id": \'VARCHAR\', ' +
                '"sql_chart_id": \'VARCHAR\', "warehouse_execution_time_ms": \'BIGINT\', ' +
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

    it('compacts closed partitions and deletes raw files only after a successful write', async () => {
        const closedKeys = [
            rawKey('org-1', 'query_events', '2026-07-01', 'a.jsonl.gz'),
            rawKey('org-1', 'query_events', '2026-07-01', 'b.jsonl.gz'),
        ];
        mockListedKeys([
            ...closedKeys,
            rawKey('org-1', 'query_events', '2026-07-02'), // open day: untouched
        ]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary).toEqual({
            partitionsDiscovered: 1,
            partitionsCompacted: 1,
            partitionsFailed: 0,
            partitionsSkippedUnknownStream: 0,
            rawObjectsDeleted: 2,
        });
        expect(duckdbMocks.runSqlWithMetrics).toHaveBeenCalledTimes(1);
        expect(s3Mocks.deleteObjects).toHaveBeenCalledTimes(1);
        expect(s3Mocks.deleteObjects).toHaveBeenCalledWith({
            Bucket: 'events-bucket',
            Delete: {
                Objects: closedKeys.map((Key) => ({ Key })),
                Quiet: true,
            },
        });
        // COPY must complete before the raw delete is issued
        expect(
            duckdbMocks.runSqlWithMetrics.mock.invocationCallOrder[0],
        ).toBeLessThan(s3Mocks.deleteObjects.mock.invocationCallOrder[0]);
        expect(
            metrics.incrementUsageEventsCompactedPartitions,
        ).toHaveBeenCalledTimes(1);
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
        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining('duckdb exploded'),
        );
    });

    it('skips unknown streams with a warning and leaves their raw files in place', async () => {
        mockListedKeys([
            rawKey('org-1', 'mystery_stream', '2026-07-01'),
            rawKey('org-1', 'query_events', '2026-07-01'),
        ]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary.partitionsSkippedUnknownStream).toEqual(1);
        expect(summary.partitionsCompacted).toEqual(1);
        expect(duckdbMocks.runSqlWithMetrics).toHaveBeenCalledTimes(1);
        expect(duckdbMocks.runSqlWithMetrics.mock.calls[0][0]).toContain(
            'stream=query_events',
        );
        expect(s3Mocks.deleteObjects).toHaveBeenCalledTimes(1);
        expect(s3Mocks.deleteObjects.mock.calls[0][0].Delete.Objects).toEqual([
            { Key: rawKey('org-1', 'query_events', '2026-07-01') },
        ]);
        expect(Logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('unknown stream'),
        );
    });

    it('continues with remaining partitions after a failure', async () => {
        duckdbMocks.runSqlWithMetrics
            .mockRejectedValueOnce(new Error('first partition failed'))
            .mockResolvedValueOnce({ bootstrapMs: 1, queryMs: 1, totalMs: 2 });
        mockListedKeys([
            rawKey('org-1', 'query_events', '2026-06-30'),
            rawKey('org-1', 'query_events', '2026-07-01'),
        ]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary.partitionsFailed).toEqual(1);
        expect(summary.partitionsCompacted).toEqual(1);
        expect(duckdbMocks.runSqlWithMetrics).toHaveBeenCalledTimes(2);
        expect(s3Mocks.deleteObjects).toHaveBeenCalledTimes(1);
    });

    it('paginates the raw zone listing', async () => {
        s3Mocks.listObjectsV2
            .mockResolvedValueOnce({
                Contents: [
                    {
                        Key: rawKey(
                            'org-1',
                            'query_events',
                            '2026-07-01',
                            'a.jsonl.gz',
                        ),
                    },
                ],
                IsTruncated: true,
                NextContinuationToken: 'token-1',
            })
            .mockResolvedValueOnce({
                Contents: [
                    {
                        Key: rawKey(
                            'org-1',
                            'query_events',
                            '2026-07-01',
                            'b.jsonl.gz',
                        ),
                    },
                ],
                IsTruncated: false,
            });

        const summary = await createCompactor(metrics).run(NOW);

        expect(s3Mocks.listObjectsV2).toHaveBeenCalledTimes(2);
        expect(
            s3Mocks.listObjectsV2.mock.calls[1][0].ContinuationToken,
        ).toEqual('token-1');
        expect(summary.rawObjectsDeleted).toEqual(2);
    });

    it('no-ops when the raw zone is empty', async () => {
        mockListedKeys([]);

        const summary = await createCompactor(metrics).run(NOW);

        expect(summary.partitionsDiscovered).toEqual(0);
        expect(duckdbMocks.runSqlWithMetrics).not.toHaveBeenCalled();
        expect(s3Mocks.deleteObjects).not.toHaveBeenCalled();
    });
});
