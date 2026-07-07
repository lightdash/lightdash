import { gunzipSync } from 'zlib';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import {
    BufferedEventStreamWriter,
    BufferedEventStreamWriterArgs,
} from './BufferedEventStreamWriter';
import { EventStreamRow } from './types';

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
    const putObject = vi.fn();
    class FakeS3 {
        putObject = putObject;
    }
    return { putObject, FakeS3 };
});

vi.mock('@aws-sdk/client-s3', () => ({
    S3: s3Mocks.FakeS3,
}));

const s3Config = {
    endpoint: 'https://s3.example.com',
    region: 'us-east-1',
    bucket: 'events-bucket',
    accessKey: 'AKIA',
    secretKey: 'SECRET',
    forcePathStyle: true,
};

const createMetricsMock = () => ({
    incrementUsageEventsPushed: vi.fn(),
    incrementUsageEventsFlushed: vi.fn(),
    incrementUsageEventsRawPuts: vi.fn(),
    incrementUsageEventsDropped: vi.fn(),
    incrementUsageEventsPutFailure: vi.fn(),
});

type MetricsMock = ReturnType<typeof createMetricsMock>;

const createWriter = (
    metrics: MetricsMock,
    overrides: Partial<BufferedEventStreamWriterArgs> = {},
) =>
    new BufferedEventStreamWriter({
        s3Config,
        flushIntervalMs: 60000,
        flushBatchSize: 1000,
        bufferMaxSize: 10000,
        prometheusMetrics: metrics as unknown as PrometheusMetrics,
        ...overrides,
    });

const row = (overrides: Partial<EventStreamRow> = {}): EventStreamRow => ({
    org_id: 'org-1',
    event_ts: '2026-07-01T12:00:00.000Z',
    ...overrides,
});

const decodeBody = (body: Uint8Array): string =>
    gunzipSync(Buffer.from(body)).toString('utf8');

describe('BufferedEventStreamWriter', () => {
    let metrics: MetricsMock;

    beforeEach(() => {
        vi.clearAllMocks();
        metrics = createMetricsMock();
        s3Mocks.putObject.mockResolvedValue({});
    });

    it('writes rows as gzipped JSONL under the partitioned raw zone key', async () => {
        const writer = createWriter(metrics);
        const testRow = row();
        writer.push('query_executed', testRow);

        await writer.flush();

        expect(s3Mocks.putObject).toHaveBeenCalledTimes(1);
        const putArgs = s3Mocks.putObject.mock.calls[0][0];
        expect(putArgs.Bucket).toEqual('events-bucket');
        expect(putArgs.Key).toMatch(
            /^events\/raw\/org_id=org-1\/stream=query_executed\/dt=2026-07-01\/[0-9a-f]{8}-[0-9a-f-]{36}\.jsonl\.gz$/,
        );
        expect(decodeBody(putArgs.Body)).toEqual(
            `${JSON.stringify(testRow)}\n`,
        );

        await writer.close();
    });

    it('groups rows by org_id, stream and event date into one object each', async () => {
        const writer = createWriter(metrics);
        writer.push('query_executed', row());
        writer.push('query_executed', row());
        writer.push('query_executed', row({ org_id: 'org-2' }));
        writer.push('dashboard_viewed', row());
        writer.push(
            'query_executed',
            row({ event_ts: '2026-06-30T23:59:59.000Z' }),
        );

        await writer.flush();

        expect(s3Mocks.putObject).toHaveBeenCalledTimes(4);
        expect(metrics.incrementUsageEventsRawPuts).toHaveBeenCalledTimes(4);
        const keys = s3Mocks.putObject.mock.calls.map(
            (call) => call[0].Key as string,
        );
        expect(keys).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'events/raw/org_id=org-1/stream=query_executed/dt=2026-07-01/',
                ),
                expect.stringContaining(
                    'events/raw/org_id=org-2/stream=query_executed/dt=2026-07-01/',
                ),
                expect.stringContaining(
                    'events/raw/org_id=org-1/stream=dashboard_viewed/dt=2026-07-01/',
                ),
                expect.stringContaining(
                    'events/raw/org_id=org-1/stream=query_executed/dt=2026-06-30/',
                ),
            ]),
        );
        // Object keys are unique across groups
        expect(new Set(keys).size).toEqual(4);
        // The two rows sharing a partition end up in a single object
        const groupedCall = s3Mocks.putObject.mock.calls.find((call) =>
            (call[0].Key as string).includes(
                'org_id=org-1/stream=query_executed/dt=2026-07-01',
            ),
        );
        expect(
            decodeBody(groupedCall![0].Body).trimEnd().split('\n'),
        ).toHaveLength(2);

        await writer.close();
    });

    it('falls back to the current UTC date when event_ts is invalid', async () => {
        const writer = createWriter(metrics);
        writer.push('query_executed', row({ event_ts: 'not-a-date' }));

        await writer.flush();

        const today = new Date().toISOString().slice(0, 10);
        expect(s3Mocks.putObject.mock.calls[0][0].Key).toContain(`dt=${today}`);

        await writer.close();
    });
});
