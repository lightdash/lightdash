import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { LightdashAnalytics } from '../LightdashAnalytics';
import { type DataAppStreamEvent } from './dataAppEventsStream';
import { EventStreamSink } from './EventStreamSink';
import { eventStreamRegistry, getCompactedStreamColumns } from './registry';
import { type EventStreamRow } from './types';
import { buildCompactionSql } from './UsageEventsCompactor';

const createWriter = () => ({
    push: vi.fn<(stream: string, row: EventStreamRow) => void>(),
    flush: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
});

const properties = {
    organizationId: 'org-1',
    projectId: 'project-1',
    appUuid: 'app-1',
};

describe('data app usage events', () => {
    it('captures the existing view event through track when RudderStack is disabled', () => {
        const writer = createWriter();
        const analytics = new LightdashAnalytics({
            lightdashConfig: {
                ...lightdashConfigMock,
                rudder: { writeKey: '', dataPlaneUrl: 'notrack' },
            },
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
            eventStreamSink: new EventStreamSink(eventStreamRegistry, writer),
        });
        analytics.track({
            event: 'data_app.view',
            userId: 'viewer-1',
            properties,
        });
        expect(writer.push).toHaveBeenCalledExactlyOnceWith(
            'data_app_events',
            expect.objectContaining({
                event_name: 'data_app.view',
                app_id: 'app-1',
                user_id: 'viewer-1',
            }),
        );
    });

    it.each<[DataAppStreamEvent['event'], number | null]>([
        ['data_app.view', null],
        ['data_app.created', 3],
        ['data_app.iterated', 3],
        ['data_app.version.completed', 3],
        ['data_app.version.failed', 3],
        ['data_app.version.cancelled', 3],
        ['data_app.version.restored', 3],
        ['data_app.duplicated', null],
        ['data_app.deleted', null],
        ['data_app.promoted', 3],
        ['data_app.uploaded', 3],
        ['data_app.downloaded', 3],
    ])('captures only allowed metadata for %s', (event, version) => {
        const writer = createWriter();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            event,
            userId: 'user-1',
            properties: {
                ...properties,
                ...(version === null ? {} : { version }),
                errorMessage: 'private error',
                prompt: 'private prompt',
                customDependencies: [{ name: 'private-package' }],
            },
        });
        expect(writer.push).toHaveBeenCalledExactlyOnceWith('data_app_events', {
            event_name: event,
            org_id: 'org-1',
            user_id: 'user-1',
            event_ts: expect.any(String),
            schema_version: 1,
            project_id: 'project-1',
            app_id: 'app-1',
            version,
        });
    });

    it('drops unattributed events and does not opt in all data app events', () => {
        const writer = createWriter();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        sink.handle({
            event: 'data_app.view',
            userId: 'user-1',
            properties: { ...properties, organizationId: '' },
        });
        sink.handle({
            event: 'data_app.file_uploaded',
            userId: 'user-1',
            properties,
        });
        expect(writer.push).not.toHaveBeenCalled();
    });

    it('round-trips events through typed Parquet and counts views separately from builds', async () => {
        const writer = createWriter();
        const sink = new EventStreamSink(eventStreamRegistry, writer);
        for (const [event, userId, appUuid] of [
            ['data_app.view', 'viewer-1', 'app-1'],
            ['data_app.view', 'viewer-1', 'app-1'],
            ['data_app.view', 'viewer-2', 'app-2'],
            ['data_app.iterated', 'builder-1', 'app-2'],
        ]) {
            sink.handle({
                event,
                userId,
                properties: { ...properties, appUuid, version: 3 },
            });
        }
        const directory = await mkdtemp(
            path.join(tmpdir(), 'data-app-events-'),
        );
        const rawFile = path.join(directory, 'events.jsonl.gz');
        const parquetFile = path.join(directory, 'events.parquet');
        const instance = await DuckDBInstance.create(':memory:');
        const connection = await instance.connect();
        try {
            await writeFile(
                rawFile,
                gzipSync(
                    writer.push.mock.calls
                        .map(([, row]) => JSON.stringify(row))
                        .join('\n'),
                ),
            );
            const columns = getCompactedStreamColumns('data_app_events');
            expect(columns).not.toBeNull();
            const { sql, compactedKey } = buildCompactionSql({
                bucket: 'test-bucket',
                partition: {
                    orgId: 'org-1',
                    stream: 'data_app_events',
                    dt: '2026-09-15',
                    keys: ['events.jsonl.gz'],
                },
                columns: columns!,
            });
            // Exercise production compaction SQL with local files instead of S3.
            await connection.run(
                sql
                    .replace('s3://test-bucket/events.jsonl.gz', rawFile)
                    .replace(`s3://test-bucket/${compactedKey}`, parquetFile),
            );
            await connection.run(
                `CREATE VIEW data_app_events AS SELECT * FROM read_parquet('${parquetFile}')`,
            );
            const explore = createAnalyticsExplores().find(
                ({ name }) => name === 'data_app_events',
            )!;
            const { metrics } = explore.tables.data_app_events;
            const totals = await connection.runAndReadAll(
                `SELECT ${metrics.total_events.compiledSql} AS events, ${metrics.total_views.compiledSql} AS views, ${metrics.unique_viewers.compiledSql} AS viewers, ${metrics.unique_apps.compiledSql} AS apps FROM data_app_events`,
            );
            expect(totals.getRowObjects()).toEqual([
                { events: 4n, views: 3n, viewers: 2n, apps: 2n },
            ]);
            const rows = await connection.runAndReadAll(
                'SELECT event_name, version FROM data_app_events',
            );
            expect(rows.getRowObjects()).toEqual([
                { event_name: 'data_app.view', version: null },
                { event_name: 'data_app.view', version: null },
                { event_name: 'data_app.view', version: null },
                { event_name: 'data_app.iterated', version: 3 },
            ]);
        } finally {
            connection.closeSync();
            instance.closeSync();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
