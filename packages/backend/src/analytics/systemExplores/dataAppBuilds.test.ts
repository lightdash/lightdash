/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { EventStreamSink } from '../eventStream/EventStreamSink';
import {
    compactedStreamSchemas,
    eventStreamRegistry,
} from '../eventStream/registry';
import type { EventStreamRow } from '../eventStream/types';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../eventStream/usageDimensions';
import { buildCompactionSql } from '../eventStream/UsageEventsCompactor';
import { dataAppBuildsSql } from './dataAppBuilds';

const compile = (
    dimensions: string[],
    metrics = ['total_builds', 'total_tokens_used'],
) => {
    const explore = createAnalyticsExplores().find(
        (e) => e.name === 'data_app_builds',
    )!;
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery: {
            exploreName: explore.name,
            dimensions,
            metrics: metrics.map((name) => `data_app_builds_${name}`),
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            compiledTableCalculations: [],
            compiledAdditionalMetrics: [],
            compiledCustomDimensions: [],
        },
        warehouseSqlBuilder: warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB),
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery().query;
};

describe('Data app builds through raw projection, Parquet and compiled Explore SQL', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    let directory: string;
    beforeAll(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'data-app-builds-'));
        instance = await DuckDBInstance.create(':memory:');
        db = await instance.connect();
        const rows = new Map<string, EventStreamRow[]>();
        const sink = new EventStreamSink(eventStreamRegistry, {
            push: (stream, row) =>
                rows.set(stream, [...(rows.get(stream) ?? []), row]),
            flush: async () => {},
            close: async () => {},
        });
        const event = (
            eventName: string,
            version: number,
            properties: Record<string, unknown> = {},
            userId = 'builder',
        ) => {
            sink.handle({
                event: eventName,
                userId,
                properties: {
                    organizationId: 'org',
                    projectId: 'project',
                    appUuid: 'app',
                    version,
                    codingAgent: 'claude',
                    codingAgentModel: 'sonnet',
                    claudeProvider: 'anthropic',
                    isIteration: version > 1,
                    totalDurationMs: 1000,
                    schedulerWaitMs: 100,
                    ...properties,
                },
            });
        };
        event('data_app.created', 1);
        event('data_app.version.completed', 1);
        event('data_app.version.completed', 1); // duplicate delivery
        event('data_app.iterated', 2);
        event('data_app.version.failed', 2, {
            wasResumed: true,
            failureStage: 'building',
            totalDurationMs: 3000,
            errorMessage: 'private error',
        });
        event('data_app.iterated', 3);
        event(
            'data_app.version.cancelled',
            3,
            { stageAtCancellation: 'generating', msElapsedBeforeCancel: 5000 },
            'canceller',
        );
        event('data_app.iterated', 4, {}, 'second-builder');
        event('data_app.version.restored', 5);
        event('data_app.view', 1);
        event(
            'data_app.version.completed',
            1,
            { appUuid: 'deleted-app' },
            'deleted-builder',
        );
        event('data_app.version.completed', 1, { organizationId: 'other-org' });
        const ai = (
            eventId: string,
            version: number | null,
            tokens: number,
            properties: Record<string, unknown> = {},
        ) =>
            sink.handle({
                event: 'ai.usage',
                userId: 'builder',
                properties: {
                    organizationId: 'org',
                    projectId: 'project',
                    dataAppId: 'app',
                    dataAppVersion: version,
                    eventId,
                    feature: 'data-app',
                    functionId: 'appClaudeGeneration',
                    outcome: 'complete',
                    model: 'model-a',
                    provider: 'anthropic',
                    inputTokens: tokens - 10,
                    outputTokens: 10,
                    totalTokens: tokens,
                    cacheReadTokens: 20,
                    cacheWriteTokens: 5,
                    ...properties,
                },
            });
        ai('a', 1, 100);
        ai('a', 1, 100);
        ai('b', 1, 50, { model: 'model-b' });
        ai('compact', 1, 20, { functionId: 'appClaudeCompaction' });
        ai('failed', 2, 30, { outcome: 'partial' });
        ai('other', 1, 900, { organizationId: 'other-org' });
        ai('unlinked-history', null, 9999);
        ai('other-operation', 1, 9999, { functionId: 'appAnalysis' });
        ai('other-project', 1, 9999, { projectId: 'other-project' });
        for (const stream of ['data_app_events', 'ai_usage'] as const) {
            const raw = path.join(directory, `${stream}.jsonl.gz`);
            const parquet = path.join(directory, `${stream}.parquet`);
            const streamRows = rows.get(stream)!.map((row) => ({
                ...row,
                event_ts:
                    row.event_name === 'data_app.created'
                        ? '2026-10-03T23:59:59Z'
                        : '2026-10-04T00:00:01Z',
            }));
            await writeFile(
                raw,
                gzipSync(streamRows.map((r) => JSON.stringify(r)).join('\n')),
            );
            const { sql, compactedKey } = buildCompactionSql({
                bucket: 'fixture',
                partition: {
                    orgId: 'org',
                    stream,
                    dt: '2026-10-04',
                    keys: ['raw.jsonl.gz'],
                },
                columns: compactedStreamSchemas[stream],
            });
            const localSql = sql
                .replace('s3://fixture/raw.jsonl.gz', raw)
                .replace(`s3://fixture/${compactedKey}`, parquet);
            await db.run(localSql);
            await db.run(localSql); // deterministic rerun replaces the same output
            await db.run(
                `CREATE TABLE ${stream} AS SELECT * FROM read_parquet('${parquet}')`,
            );
        }
        // The production reader fills new columns on old files with nulls.
        // This retains historical build counts without inventing timing/usage.
        await db.run(`INSERT INTO data_app_events (org_id, project_id, app_id, version, event_name, event_ts)
            VALUES ('org','project','legacy-app',1,'data_app.version.completed','2026-09-01')`);
        for (const dimension of ['users', 'content'] as const) {
            await db.run(
                `CREATE TABLE ${usageDimensionTable(dimension)} (${usageDimensionSchemas[dimension].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
        }
        await db.run(
            `INSERT INTO lightdash_users VALUES ('org','builder','Alex'), ('other-org','builder','Other Alex')`,
        );
        await db.run(`INSERT INTO lightdash_content (org_id,project_id,content_type,content_id,content_name,project_name)
            VALUES ('org','project','data_app','app','Revenue app','Example project'),
                ('other-org','project','data_app','app','Other app','Other project')`);
    });
    afterAll(async () => {
        db?.closeSync();
        instance?.closeSync();
        await rm(directory, { recursive: true, force: true });
    });

    it('reconciles builds and captured deltas without lifecycle/model/delivery fanout', async () => {
        const rows = (
            await db.runAndReadAll(
                compile(
                    [],
                    [
                        'total_builds',
                        'completed_builds',
                        'failed_builds',
                        'cancelled_builds',
                        'pending_builds',
                        'total_tokens_used',
                        'total_usage_records',
                    ],
                ),
            )
        ).getRowObjectsJson();
        expect(rows).toEqual([
            {
                data_app_builds_total_builds: '7',
                data_app_builds_completed_builds: '4',
                data_app_builds_failed_builds: '1',
                data_app_builds_cancelled_builds: '1',
                data_app_builds_pending_builds: '1',
                data_app_builds_total_tokens_used: '1100',
                data_app_builds_total_usage_records: '5',
            },
        ]);
    });

    it('keeps missing history/usage unknown and does not attribute a build to its canceller', async () => {
        const rows = (
            await db.runAndReadAll(
                `SELECT * FROM ${dataAppBuildsSql} WHERE org_id = 'org'`,
            )
        ).getRowObjectsJson();
        expect(rows.find((r) => r.version === 3)).toMatchObject({
            user_id: 'builder',
            status: 'cancelled',
            total_tokens: null,
            duration_ms: null,
        });
        expect(rows.find((r) => r.app_id === 'legacy-app')).toMatchObject({
            start_observed: false,
            started_at: null,
            duration_ms: null,
            total_tokens: null,
        });
        expect(rows.find((r) => r.version === 2)).toMatchObject({
            was_resumed: true,
            total_tokens: '30',
            duration_ms: '3000',
            outcome_stage: 'building',
        });
        expect(
            rows.find((r) => r.app_id === 'app' && r.version === 1),
        ).toMatchObject({ total_tokens: '170', start_observed: true });
        expect(
            (
                await db.runAndReadAll('SELECT * FROM data_app_events')
            ).columnNames(),
        ).not.toContain('errorMessage');
    });

    it('preserves totals across names, projects, weeks, models, outcomes and missing identities', async () => {
        for (const dimensions of [
            [],
            ['lightdash_users_name'],
            ['lightdash_apps_name'],
            ['data_app_builds_status', 'data_app_builds_requested_model'],
            ['data_app_builds_activity_at_week', 'lightdash_apps_project_name'],
            [
                'lightdash_users_name',
                'lightdash_apps_name',
                'data_app_builds_version',
            ],
            [
                'data_app_builds_is_iteration',
                'data_app_builds_was_resumed',
                'data_app_builds_provider',
            ],
        ]) {
            const rows = (
                await db.runAndReadAll(compile(dimensions))
            ).getRowObjectsJson();
            expect(
                rows.reduce(
                    (sum, r) => sum + Number(r.data_app_builds_total_builds),
                    0,
                ),
            ).toBe(7);
            expect(
                rows.reduce(
                    (sum, r) =>
                        sum + Number(r.data_app_builds_total_tokens_used),
                    0,
                ),
            ).toBe(1100);
        }
        const names = (
            await db.runAndReadAll(
                compile(['lightdash_users_name', 'lightdash_apps_name']),
            )
        ).getRowObjectsJson();
        expect(
            names.find((r) => r.lightdash_apps_name === 'Other app'),
        ).toMatchObject({
            lightdash_users_name: 'Other Alex',
            data_app_builds_total_builds: '1',
            data_app_builds_total_tokens_used: '900',
        });
    });

    it('supports empty streams and all timing metrics', async () => {
        await db.runAndReadAll(
            compile(
                [],
                [
                    'average_duration_ms',
                    'p95_duration_ms',
                    'average_scheduler_wait_ms',
                ],
            ),
        );
        await db.run('BEGIN');
        try {
            await db.run('DELETE FROM data_app_events');
            await db.run('DELETE FROM ai_usage');
            expect(
                (await db.runAndReadAll(compile([]))).getRowObjectsJson(),
            ).toEqual([
                {
                    data_app_builds_total_builds: '0',
                    data_app_builds_total_tokens_used: null,
                },
            ]);
        } finally {
            await db.run('ROLLBACK');
        }
    });
    it('reconciles 100,000 builds with duplicated usage records', async () => {
        await db.run('BEGIN');
        try {
            await db.run(`INSERT INTO data_app_events (org_id, project_id, app_id, version, event_name, event_ts)
                SELECT 'load', 'project', 'app', i::INTEGER, 'data_app.version.completed', TIMESTAMP '2026-10-04'
                FROM range(1, 100001) t(i)`);
            await db.run(`INSERT INTO ai_usage (org_id, project_id, app_id, app_version, event_id, event_ts, feature, function_id, total_tokens)
                SELECT 'load', 'project', 'app', i::INTEGER, 'usage-' || i, TIMESTAMP '2026-10-04', 'data-app', 'appClaudeGeneration', 120
                FROM range(1, 100001) t(i), range(2)`);
            const rows = (
                await db.runAndReadAll(compile([]))
            ).getRowObjectsJson();
            expect(rows).toEqual([
                {
                    data_app_builds_total_builds: '100007',
                    data_app_builds_total_tokens_used: '12001100',
                },
            ]);
        } finally {
            await db.run('ROLLBACK');
        }
    });
});
