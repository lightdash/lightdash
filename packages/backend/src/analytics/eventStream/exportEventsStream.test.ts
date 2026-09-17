import { DuckDBInstance } from '@duckdb/node-api';
import { SchedulerFormat } from '@lightdash/common';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { LightdashAnalytics } from '../LightdashAnalytics';
import { EventStreamSink } from './EventStreamSink';
import { eventStreamRegistry, getCompactedStreamColumns } from './registry';
import type { EventStreamRow } from './types';
import { buildCompactionSql } from './UsageEventsCompactor';

const setup = () => {
    const writer = {
        push: vi.fn<(stream: string, row: EventStreamRow) => void>(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    };
    return { writer, sink: new EventStreamSink(eventStreamRegistry, writer) };
};
const properties = {
    organizationId: 'org-1',
    projectId: 'project-1',
    fileType: SchedulerFormat.CSV as const,
};

describe('export usage events', () => {
    it.each([
        'download_results.started',
        'download_results.completed',
        'download_results.error',
    ] as const)(
        'captures %s without RudderStack and only includes approved metadata',
        (event) => {
            const { writer, sink } = setup();
            const analytics = new LightdashAnalytics({
                lightdashConfig: lightdashConfigMock,
                writeKey: 'notrack',
                dataPlaneUrl: 'notrack',
                options: { enable: false },
                eventStreamSink: sink,
            });
            analytics.track({
                event,
                userId: 'user-1',
                properties: {
                    ...properties,
                    error: 'private error',
                    signedUrl: 'https://private.test/token',
                    rows: [{ secret: 'value' }],
                },
            });
            expect(writer.push).toHaveBeenCalledExactlyOnceWith(
                'export_events',
                {
                    event_name: event,
                    org_id: 'org-1',
                    user_id: 'user-1',
                    event_ts: expect.any(String),
                    schema_version: 1,
                    project_id: 'project-1',
                    query_id: null,
                    format: 'csv',
                    context: null,
                    job_id: null,
                    table_id: null,
                    num_rows: null,
                },
            );
            sink.handle({
                event,
                properties: { ...properties, organizationId: '' },
            });
            expect(writer.push).toHaveBeenCalledTimes(1);
        },
    );

    it('round-trips existing export metadata through Parquet and the separate model', async () => {
        const { writer, sink } = setup();
        for (const format of ['csv', 'xlsx', 'gsheets']) {
            sink.handle({
                event: 'download_results.completed',
                userId: 'user-1',
                properties: {
                    ...properties,
                    queryId: 'query-1',
                    fileType: format,
                    jobId: 'job-1',
                    context: 'chart',
                    tableId: 'table-1',
                    numRows: 25,
                },
            });
        }
        const directory = await mkdtemp(path.join(tmpdir(), 'export-events-'));
        const rawFile = path.join(directory, 'events.jsonl.gz');
        const parquetFile = path.join(directory, 'events.parquet');
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            await writeFile(
                rawFile,
                gzipSync(
                    writer.push.mock.calls
                        .map(([, row]) => JSON.stringify(row))
                        .join('\n'),
                ),
            );
            const { sql, compactedKey } = buildCompactionSql({
                bucket: 'test-bucket',
                partition: {
                    orgId: 'org-1',
                    stream: 'export_events',
                    dt: '2026-09-15',
                    keys: ['events.jsonl.gz'],
                },
                columns: getCompactedStreamColumns('export_events')!,
            });
            await db.run(
                sql
                    .replace('s3://test-bucket/events.jsonl.gz', rawFile)
                    .replace(`s3://test-bucket/${compactedKey}`, parquetFile),
            );
            await db.run(
                `CREATE VIEW export_events AS SELECT * FROM read_parquet('${parquetFile}')`,
            );
            const explore = createAnalyticsExplores().find(
                ({ name }) => name === 'export_events',
            )!;
            const { metrics } = explore.tables.export_events;
            const result = await db.runAndReadAll(
                `SELECT ${metrics.total_events.compiledSql} AS events, ${metrics.unique_users.compiledSql} AS users FROM export_events`,
            );
            expect(result.getRowObjects()).toEqual([{ events: 3n, users: 1n }]);
            const rows = await db.runAndReadAll(
                'SELECT query_id, format, job_id, table_id, num_rows FROM export_events ORDER BY format',
            );
            expect(rows.getRowObjects()).toEqual(
                ['csv', 'gsheets', 'xlsx'].map((format) => ({
                    query_id: 'query-1',
                    format,
                    job_id: 'job-1',
                    table_id: 'table-1',
                    num_rows: 25n,
                })),
            );
        } finally {
            db.closeSync();
            instance.closeSync();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
