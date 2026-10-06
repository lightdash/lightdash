/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { S3 } from '@aws-sdk/client-s3';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { createS3AnalyticsSourceResolver } from '../../services/ProjectService/analyticsProject/S3AnalyticsSource';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import {
    dataAppReachProjections,
    type DataAppReachEvent,
} from '../eventStream/dataAppReachStream';
import { compactedStreamSchemas } from '../eventStream/registry';
import { usageDimensionSchemas } from '../eventStream/usageDimensions';
import { UsageEventsCompactor } from '../eventStream/UsageEventsCompactor';
import { dataAppReachSql } from './dataAppReach';

const compile = (dimensions: string[], metrics: string[]) => {
    const explore = createAnalyticsExplores().find(
        (e) => e.name === 'data_app_reach',
    )!;
    const { query } = new MetricQueryBuilder({
        explore,
        compiledMetricQuery: {
            exploreName: explore.name,
            dimensions,
            metrics: metrics.map((name) => `data_app_reach_${name}`),
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
    }).compileQuery();
    DuckdbWarehouseClient.validateUserSqlFileAccess(query);
    return query;
};

describe('Data app reach', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    const rows = async (sql: string) =>
        (await db.runAndReadAll(sql)).getRowObjectsJS();
    const record = async (
        app: string,
        view: string,
        user: string | undefined,
        stage: DataAppReachEvent['properties']['stage'],
        daysAgo: number,
        overrides: Partial<DataAppReachEvent['properties']> = {},
    ) => {
        const projected = dataAppReachProjections['data_app.reach']({
            event: 'data_app.reach',
            userId: user,
            properties: {
                organizationId: 'org',
                projectId: 'project',
                appUuid: app,
                version: 1,
                eventId: `${view}:${stage}`,
                viewId: stage === 'launched' ? null : view,
                stage,
                outcome: stage === 'load' ? 'served' : null,
                isReload: false,
                viewContext: 'standalone',
                isBuilder: false,
                creatorId: 'builder',
                isShared: true,
                isPreviewProject: false,
                ...overrides,
            },
        })!.row;
        projected.event_ts = new Date(
            Date.now() - daysAgo * 86400000,
        ).toISOString();
        const columns = Object.keys(projected);
        await db.run(
            `INSERT INTO data_app_reach_events (${columns.join(',')}) VALUES (${columns
                .map(() => '?')
                .join(',')})`,
            columns.map((key) => {
                const value = projected[key];
                if (value == null) return null;
                if (
                    typeof value === 'string' ||
                    typeof value === 'number' ||
                    typeof value === 'boolean'
                )
                    return value;
                throw new Error(`Unsupported reach fixture value for ${key}`);
            }),
        );
    };
    const view = async (
        id: string,
        user: string | undefined,
        daysAgo: number,
        overrides: Partial<DataAppReachEvent['properties']> = {},
    ) => {
        await record('app', id, user, 'load', daysAgo, overrides);
        await record('app', id, user, 'sdk_ready', daysAgo, overrides);
    };
    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '256MB',
        });
        db = await instance.connect();
        for (const [name, columns] of [
            [
                'data_app_reach_events',
                compactedStreamSchemas.data_app_reach_events,
            ],
            ['lightdash_content', usageDimensionSchemas.content],
            ['lightdash_users', usageDimensionSchemas.users],
        ] as const) {
            await db.run(
                `CREATE TABLE ${name} (${columns.map((c) => `"${c.name}" ${c.type}`).join(',')})`,
            );
        }
        await db.run(`INSERT INTO lightdash_content (org_id, project_id, content_type, content_id, content_name, snapshot_at, is_deleted, app_template) VALUES
            ('org','project','data_app','app','Sales app',CURRENT_TIMESTAMP,false,'dashboard'),
            ('org','project','data_app','zero','Never viewed',CURRENT_TIMESTAMP,false,'dashboard'),
            ('org','project','data_app','new','New app',CURRENT_TIMESTAMP,false,'dashboard'),
            ('org','project','data_app','legacy','Legacy app',CURRENT_TIMESTAMP,true,NULL),
            ('org','project','data_app','viz','Chart type',CURRENT_TIMESTAMP,false,'data_app_viz')`);
        await db.run(
            `INSERT INTO lightdash_users VALUES ('org','reader','Reader'), ('other','reader','Other tenant'), ('org','builder','Builder')`,
        );
        await record('app', 'launch', 'builder', 'launched', 20);
        await record('zero', 'zero-launch', 'builder', 'launched', 20);
        await record('new', 'new-launch', 'builder', 'launched', 1);
        await view('first', 'reader', 19);
        await view('return', 'reader', 18);
        await view('builder-preview', 'builder', 17, {
            viewContext: 'builder',
            isBuilder: true,
        });
        await view('builder-reading', 'builder', 17, { isBuilder: true });
        await view('reload', 'reader', 17, { isReload: true });
        await view('embed', undefined, 17, {
            viewContext: 'embed',
            isBuilder: null,
        });
        await view('preview-project', 'reader', 17, { isPreviewProject: true });
        await view('personal', 'reader', 17, { isShared: false });
        await view('deleted-reader', 'deleted-user', 16);
        await view('unknown-builder', 'unknown', 17, { isBuilder: null });
        await view('broken', 'reader', 17);
        await record('app', 'broken', 'reader', 'render_error', 17);
        await record('app', 'html-only', 'reader', 'load', 17);
        await record('app', 'failed', 'reader', 'load', 17, {
            outcome: 'failed',
        });
        await record('app', 'orphan', 'reader', 'sdk_ready', 17);
        await db.run(
            `INSERT INTO data_app_reach_events SELECT * FROM data_app_reach_events WHERE view_id='first'`,
        );
    });
    afterAll(() => {
        db?.closeSync();
        instance?.closeSync();
    });

    it('reconciles consumers, repeat visits, names and mature adoption without duplicate fanout', async () => {
        expect(
            await rows(
                compile(
                    [],
                    [
                        'total_apps',
                        'qualifying_views',
                        'distinct_consumers',
                        'returning_consumers',
                        'mature_launched_apps',
                        'apps_adopted_within_seven_days',
                        'seven_day_adoption_rate',
                    ],
                ),
            ),
        ).toEqual([
            {
                data_app_reach_total_apps: 4n,
                data_app_reach_qualifying_views: 5n,
                data_app_reach_distinct_consumers: 2n,
                data_app_reach_returning_consumers: 1n,
                data_app_reach_mature_launched_apps: 2n,
                data_app_reach_apps_adopted_within_seven_days: 1n,
                data_app_reach_seven_day_adoption_rate: 0.5,
            },
        ]);
    });
    it('keeps zero-view, immature and unknown-launch apps distinct', async () => {
        const result = await rows(
            `SELECT app_id, adoption_status, view_id, is_deleted FROM ${dataAppReachSql} WHERE app_id <> 'app' ORDER BY app_id`,
        );
        expect(result).toEqual([
            {
                app_id: 'legacy',
                adoption_status: 'Launch unknown',
                view_id: null,
                is_deleted: true,
            },
            {
                app_id: 'new',
                adoption_status: 'Pending: seven-day window incomplete',
                view_id: null,
                is_deleted: false,
            },
            {
                app_id: 'zero',
                adoption_status:
                    'No non-builder adoption observed within seven days',
                view_id: null,
                is_deleted: false,
            },
        ]);
    });
    it.each([
        ['lightdash_users_name'],
        ['data_app_reach_app_name'],
        ['data_app_reach_event_ts_day'],
        ['data_app_reach_view_context', 'data_app_reach_render_status'],
        [
            'lightdash_users_name',
            'data_app_reach_app_name',
            'data_app_reach_event_ts_week',
        ],
    ])(
        'runs compiled dimensions %j and keeps view totals stable',
        async (...dimensions) => {
            const result = await rows(
                compile(dimensions, ['qualifying_views', 'distinct_consumers']),
            );
            expect(
                result.reduce(
                    (sum, r) => sum + Number(r.data_app_reach_qualifying_views),
                    0,
                ),
            ).toBe(5);
            expect(
                JSON.stringify(result, (_, v) =>
                    typeof v === 'bigint' ? String(v) : v,
                ),
            ).not.toContain('Other tenant');
        },
    );
    it('does not redefine the first visit when filtering later dates', async () => {
        const result = await rows(
            `SELECT returning_consumer_id FROM ${dataAppReachSql} WHERE view_id='return'`,
        );
        expect(result).toEqual([{ returning_consumer_id: 'reader' }]);
    });
    it('uses the first post-launch consumer when an earlier view arrives late', async () => {
        await db.run('BEGIN');
        try {
            await view('before-launch', 'reader', 21);
            expect(
                await rows(`SELECT DISTINCT adoption_status,
                    first_non_builder_view_at >= launched_at AS after_launch
                    FROM ${dataAppReachSql} WHERE app_id = 'app'`),
            ).toEqual([
                {
                    adoption_status:
                        'Non-builder adoption observed within seven days',
                    after_launch: true,
                },
            ]);
        } finally {
            await db.run('ROLLBACK');
        }
    });
    it('retains failures and unknown renders without counting them as qualifying views', async () => {
        expect(
            await rows(
                `SELECT view_id, render_status, is_qualifying FROM ${dataAppReachSql} WHERE view_id IN ('broken','failed','html-only') ORDER BY view_id`,
            ),
        ).toEqual([
            {
                view_id: 'broken',
                render_status: 'Runtime error observed',
                is_qualifying: false,
            },
            {
                view_id: 'failed',
                render_status: 'HTML load failed',
                is_qualifying: false,
            },
            {
                view_id: 'html-only',
                render_status: 'Render outcome unknown',
                is_qualifying: false,
            },
        ]);
    });
    it('handles an inventory with no captured reach history', async () => {
        await db.run('BEGIN');
        try {
            await db.run('DELETE FROM data_app_reach_events');
            expect(
                await rows(
                    compile(
                        [],
                        [
                            'total_apps',
                            'qualifying_views',
                            'mature_launched_apps',
                            'seven_day_adoption_rate',
                        ],
                    ),
                ),
            ).toEqual([
                {
                    data_app_reach_total_apps: 4n,
                    data_app_reach_qualifying_views: 0n,
                    data_app_reach_mature_launched_apps: 0n,
                    data_app_reach_seven_day_adoption_rate: null,
                },
            ]);
        } finally {
            await db.run('ROLLBACK');
        }
    });
    it.skipIf(!process.env.DATA_APP_REACH_SMOKE_ENDPOINT)(
        'runs real local raw-to-Parquet compaction, late arrivals, reruns and tenant-scoped queries',
        async () => {
            vi.unstubAllGlobals();
            const endpoint = process.env.DATA_APP_REACH_SMOKE_ENDPOINT!;
            if (
                !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)
            )
                throw new Error('Local S3 only');
            const org = randomUUID();
            const otherOrg = randomUUID();
            const storage = {
                endpoint,
                bucket: `app-reach-${randomUUID()}`,
                region: 'us-east-1',
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
            const captured = await rows('SELECT * FROM data_app_reach_events');
            const inventory = await rows('SELECT * FROM lightdash_content');
            const users = await rows('SELECT * FROM lightdash_users');
            const json = (r: unknown) =>
                JSON.stringify(r, (key, value) => {
                    if (key === 'org_id')
                        return value === 'org' ? org : otherOrg;
                    return typeof value === 'bigint' ? Number(value) : value;
                });
            const model = {
                async *getOrganizations() {
                    yield { organization_id: 1, organization_uuid: org };
                },
                async *getJsonLines(_org: unknown, dimension: string) {
                    const data =
                        {
                            content: inventory,
                            users: users.filter((u) => u.org_id === 'org'),
                        }[dimension] ?? [];
                    for (const row of data) yield `${json(row)}\n`;
                },
            };
            const compact = () =>
                new UsageEventsCompactor({
                    s3Config: storage,
                    prometheusMetrics: null,
                    usageDimensionsModel: model,
                }).run();
            const upload = async (
                records: unknown[],
                file: string,
                tenant = org,
            ) =>
                s3.putObject({
                    Bucket: storage.bucket,
                    Key: `events/raw/org_id=${tenant}/stream=data_app_reach_events/dt=2026-01-01/${file}.jsonl.gz`,
                    Body: gzipSync(records.map(json).join('\n')),
                });
            const reader = new DuckdbWarehouseClient({
                type: 'duckdb_parquet',
                resolveSource: createS3AnalyticsSourceResolver({
                    storage,
                    organizationUuid: org,
                }),
            });
            const totals = async () =>
                Object.fromEntries(
                    Object.entries(
                        (
                            await reader.runQuery(
                                compile(
                                    [],
                                    [
                                        'qualifying_views',
                                        'distinct_consumers',
                                        'returning_consumers',
                                    ],
                                ),
                            )
                        ).rows[0],
                    ).map(([key, value]) => [key, Number(value)]),
                );
            await s3.createBucket({ Bucket: storage.bucket });
            try {
                await upload(captured, 'captured');
                // Same app/user/view identities in another tenant must never leak.
                await upload(
                    captured.map((r) => ({ ...r, org_id: 'other' })),
                    'other',
                    otherOrg,
                );
                const begin = performance.now();
                const first = await compact();
                expect(first).toMatchObject({
                    partitionsFailed: 0,
                    dimensions: { failed: 0 },
                    users: { failed: 0 },
                });
                const afterCompact = performance.now();
                expect(await totals()).toMatchObject({
                    data_app_reach_qualifying_views: 5,
                    data_app_reach_distinct_consumers: 2,
                    data_app_reach_returning_consumers: 1,
                });
                const afterQuery = performance.now();
                // Redelivery and a late runtime failure amend the read-time model without historical rewriting.
                await upload(
                    [
                        ...captured,
                        {
                            ...captured.find((r) => r.view_id === 'return'),
                            event_id: 'return:render_error',
                            stage: 'render_error',
                            outcome: null,
                        },
                    ],
                    'late',
                );
                await compact();
                expect(await totals()).toMatchObject({
                    data_app_reach_qualifying_views: 4,
                    data_app_reach_distinct_consumers: 2,
                    data_app_reach_returning_consumers: 0,
                });
                const beforeRerun = (
                    await s3.listObjectsV2({
                        Bucket: storage.bucket,
                        Prefix: `events/compacted/org_id=${org}/stream=data_app_reach_events/`,
                    })
                ).Contents?.map((o) => o.Key);
                await compact();
                expect(
                    (
                        await s3.listObjectsV2({
                            Bucket: storage.bucket,
                            Prefix: `events/compacted/org_id=${org}/stream=data_app_reach_events/`,
                        })
                    ).Contents?.map((o) => o.Key),
                ).toEqual(beforeRerun);
                expect(await totals()).toMatchObject({
                    data_app_reach_qualifying_views: 4,
                });
                const empty = new DuckdbWarehouseClient({
                    type: 'duckdb_parquet',
                    resolveSource: createS3AnalyticsSourceResolver({
                        storage,
                        organizationUuid: randomUUID(),
                    }),
                });
                await expect(
                    empty.runQuery(
                        compile([], ['total_apps', 'qualifying_views']),
                    ),
                ).rejects.toThrow('No analytics data is available yet');
                const loadStart = performance.now();
                const template = captured
                    .filter((r) => r.view_id === 'first')
                    .slice(0, 2);
                const large = Array.from({ length: 10_000 }, (_, n) =>
                    template.map((r) => ({
                        ...r,
                        view_id: `load-${n}`,
                        event_id: `load-${n}:${r.stage}`,
                    })),
                ).flat();
                await upload(large, 'load-test');
                await compact();
                const loadCompacted = performance.now();
                expect(await totals()).toMatchObject({
                    data_app_reach_qualifying_views: 10_004,
                });
                console.info(
                    JSON.stringify({
                        loadRows: large.length,
                        loadCompactionMs: Math.round(loadCompacted - loadStart),
                        loadQueryMs: Math.round(
                            performance.now() - loadCompacted,
                        ),
                    }),
                );
                console.info(
                    JSON.stringify({
                        rawRows: captured.length * 2,
                        compactionMs: Math.round(afterCompact - begin),
                        queryMs: Math.round(afterQuery - afterCompact),
                        rerunStable: true,
                        tenantIsolated: true,
                    }),
                );
            } finally {
                const objects = await s3.listObjectsV2({
                    Bucket: storage.bucket,
                });
                if (objects.Contents?.length)
                    await s3.deleteObjects({
                        Bucket: storage.bucket,
                        Delete: {
                            Objects: objects.Contents.map((o) => ({
                                Key: o.Key!,
                            })),
                        },
                    });
                await s3.deleteBucket({ Bucket: storage.bucket });
                s3.destroy();
            }
        },
        120_000,
    );
});
