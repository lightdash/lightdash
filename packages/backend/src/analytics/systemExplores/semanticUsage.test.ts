/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
    QueryExecutionContext,
    WarehouseTypes,
    type SemanticQueryUsage,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import {
    EXPLORE,
    METRIC_QUERY,
    warehouseClientMock,
} from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import {
    queryEventsCompactedColumns,
    queryEventsProjections,
} from '../eventStream/queryEventsStream';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../eventStream/usageDimensions';
import { buildCompactionSql } from '../eventStream/UsageEventsCompactor';
import type { QueryCompletedEvent } from '../LightdashAnalytics';

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const compile = (
    dimensions: string[],
    metrics = [
        'total_queries',
        'unique_fields',
        'failed_queries',
        'cached_queries',
    ],
) => {
    const result = new MetricQueryBuilder({
        explore: createAnalyticsExplores().find(
            (e) => e.name === 'semantic_usage',
        )!,
        compiledMetricQuery: {
            exploreName: 'semantic_usage',
            dimensions,
            metrics: metrics.map((name) => `semantic_usage_${name}`),
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
    expect(result.warnings).toEqual([]);
    return result.query;
};

const usage = new QueryComposer(
    {
        metricQuery: {
            ...METRIC_QUERY,
            dimensions: ['table1_dim1'],
            metrics: ['table1_metric1'],
            filters: {},
            sorts: [{ fieldId: 'table1_dim1', descending: false }],
        },
    },
    { explore: EXPLORE, warehouseSqlBuilder: warehouseClientMock },
).getSemanticUsage();
const event = (
    id: string,
    semanticUsage?: SemanticQueryUsage,
    error = false,
): QueryCompletedEvent => ({
    event: 'query.completed',
    userId: error ? undefined : 'user',
    properties: {
        queryId: id,
        organizationId: 'org',
        projectId: 'project',
        isPreviewProject: false,
        status: error ? 'error' : 'success',
        context: QueryExecutionContext.EXPLORE,
        onboardingFlow: 'legacy',
        exploreName: 'table1',
        chartId: 'chart',
        dashboardId: 'dashboard',
        appId: 'app',
        workloadOrigin: error ? 'agent' : 'app',
        initiatingActorType: error ? 'anonymous' : 'registered_user',
        cacheHit: !error,
        executionSource: null,
        warehouseType: WarehouseTypes.POSTGRES,
        connectionWarehouseType: WarehouseTypes.POSTGRES,
        warehouseConnectionId: null,
        connectionKind: null,
        connectionCount: null,
        warehouseExecutionTimeMs: null,
        warehousePhaseTimings: null,
        totalRowCount: null,
        columnsCount: null,
        semanticUsage,
    },
});

describe('Semantic usage: capture → JSONL → Parquet → compiled Explore', () => {
    let directory: string;
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    let compactSql: string;
    beforeAll(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'semantic-usage-'));
        instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '256MB',
            threads: '1',
        });
        db = await instance.connect();
        const events = [
            event('one', usage),
            event('one', usage),
            event('error', usage, true),
            event('sql', { status: 'unavailable', references: [] }),
        ];
        const rows = events.map(
            (e) => queryEventsProjections['query.completed'](e)!.row,
        );
        const raw = path.join(directory, 'raw.jsonl');
        const parquet = path.join(directory, 'current.parquet');
        await writeFile(raw, rows.map((row) => JSON.stringify(row)).join('\n'));
        const { sql } = buildCompactionSql({
            bucket: 'test',
            partition: {
                orgId: 'org',
                stream: 'query_events',
                dt: '2026-10-04',
                keys: ['raw.jsonl'],
            },
            columns: queryEventsCompactedColumns,
        });
        compactSql = sql
            .replace("'s3://test/raw.jsonl'", literal(raw))
            .replace(/TO 's3:\/\/test\/[^']+'/u, `TO ${literal(parquet)}`);
        await db.run(compactSql);
        // Actual legacy Parquet without any of the new columns. The manifest's
        // typed empty union is what permits mixed schemas without a backfill.
        const legacy = path.join(directory, 'legacy.parquet');
        await db.run(
            `COPY (SELECT 'org' AS org_id, 'project' AS project_id, 'legacy' AS query_id, TIMESTAMP '2026-10-03' AS event_ts) TO ${literal(legacy)} (FORMAT PARQUET)`,
        );
        await db.run(
            `CREATE VIEW query_events AS SELECT * FROM read_parquet([${literal(parquet)}, ${literal(legacy)}], union_by_name=true)`,
        );
        for (const name of [
            'users',
            'charts',
            'dashboards',
            'content',
        ] as const) {
            await db.run(
                `CREATE TABLE ${usageDimensionTable(name)} (${usageDimensionSchemas[name].map((c) => `"${c.name}" ${c.type}`).join(',')})`,
            );
        }
        await db.run(
            "INSERT INTO lightdash_users VALUES ('org', 'user', 'Alex'), ('other-org', 'user', 'Other tenant')",
        );
        await db.run(
            "INSERT INTO lightdash_charts (org_id, chart_id, name) VALUES ('org', 'chart', 'Revenue'), ('other-org', 'chart', 'Other chart')",
        );
        await db.run(
            "INSERT INTO lightdash_dashboards (org_id, dashboard_id, name) VALUES ('org', 'dashboard', 'Product overview')",
        );
        await db.run(
            "INSERT INTO lightdash_content (org_id, project_id, content_id, content_type, content_name, project_name) VALUES ('org', 'project', 'app', 'data_app', 'Sales app', 'Demo'), ('other-org', 'project', 'app', 'data_app', 'Other app', 'Other')",
        );
    });
    afterAll(async () => {
        db?.closeSync();
        instance?.closeSync();
        if (directory) await rm(directory, { recursive: true, force: true });
    });

    it('deduplicates field roles and redelivery while retaining cached, failed and unknown queries', async () => {
        expect(
            (await db.runAndReadAll(compile([]))).getRowObjectsJson(),
        ).toEqual([
            {
                semantic_usage_total_queries: '4',
                semantic_usage_unique_fields: '2',
                semantic_usage_failed_queries: '1',
                semantic_usage_cached_queries: '2',
            },
        ]);
        const rows = (
            await db.runAndReadAll(
                compile(['semantic_usage_field_label', 'semantic_usage_role']),
            )
        ).getRowObjectsJson();
        expect(
            rows
                .filter((r) => r.semantic_usage_field_label !== null)
                .every((r) => r.semantic_usage_total_queries === '2'),
        ).toBe(true);
        expect(
            (
                await db.runAndReadAll('SELECT COUNT(*) AS n FROM query_events')
            ).getRowObjectsJson(),
        ).toEqual([{ n: '5' }]);
    });

    it('keeps unavailable and historical lineage explicit, including anonymous actors', async () => {
        const rows = (
            await db.runAndReadAll(
                compile(
                    ['semantic_usage_lineage_status'],
                    ['total_queries', 'unique_users'],
                ),
            )
        ).getRowObjectsJson();
        expect(rows).toEqual(
            expect.arrayContaining([
                {
                    semantic_usage_lineage_status: 'captured',
                    semantic_usage_total_queries: '2',
                    semantic_usage_unique_users: '1',
                },
                {
                    semantic_usage_lineage_status: 'unavailable',
                    semantic_usage_total_queries: '1',
                    semantic_usage_unique_users: '1',
                },
                {
                    semantic_usage_lineage_status: 'not_captured',
                    semantic_usage_total_queries: '1',
                    semantic_usage_unique_users: '0',
                },
            ]),
        );
    });

    it('runs grouped metric combinations and name joins without tenant fanout', async () => {
        const dimensions = [
            ['semantic_usage_field_kind', 'semantic_usage_role'],
            [
                'semantic_usage_event_ts_day',
                'semantic_usage_workload_origin',
                'semantic_usage_field_label',
            ],
            [
                'semantic_usage_definition_hash',
                'semantic_usage_field_origin',
                'semantic_usage_status',
            ],
            [
                'lightdash_users_name',
                'lightdash_charts_name',
                'lightdash_dashboards_name',
                'lightdash_apps_name',
            ],
            [
                'semantic_usage_context',
                'semantic_usage_initiating_actor_type',
                'semantic_usage_cache_hit',
            ],
        ];
        for (const group of dimensions) {
            const rows = (
                await db.runAndReadAll(compile(group))
            ).getRowObjectsJson();
            expect(rows.length).toBeGreaterThan(0);
            expect(JSON.stringify(rows)).not.toContain('Other');
        }
        expect(
            (
                await db.runAndReadAll(
                    compile(
                        [],
                        ['unique_charts', 'unique_dashboards', 'unique_apps'],
                    ),
                )
            ).getRowObjectsJson(),
        ).toEqual([
            {
                semantic_usage_unique_charts: '1',
                semantic_usage_unique_dashboards: '1',
                semantic_usage_unique_apps: '1',
            },
        ]);
    });

    it('repeated compaction preserves totals and old Parquet is not rewritten', async () => {
        const before = (
            await db.runAndReadAll(compile([]))
        ).getRowObjectsJson();
        await db.run(compactSql);
        expect(
            (await db.runAndReadAll(compile([]))).getRowObjectsJson(),
        ).toEqual(before);
    });
    it.skipIf(!process.env.SEMANTIC_USAGE_LOAD_TEST)(
        'compacts and queries 50k completed attempts with a 256MB DuckDB limit',
        async () => {
            const raw = path.join(directory, 'load.jsonl');
            const parquet = path.join(directory, 'load.parquet');
            const count = 50_000;
            await db.run(`COPY (SELECT 'query.completed' AS event_name, 'org' AS org_id,
            'project' AS project_id, 'query-' || i AS query_id, 'user-' || (i % 20) AS user_id,
            TIMESTAMP '2026-10-04' AS event_ts, 'success' AS status, i % 2 = 0 AS cache_hit,
            'captured' AS semantic_lineage_status, ${literal(JSON.stringify(usage.references))} AS semantic_field_references
            FROM range(${count}) t(i)) TO ${literal(raw)} (FORMAT JSON)`);
            const { sql } = buildCompactionSql({
                bucket: 'test',
                partition: {
                    orgId: 'org',
                    stream: 'query_events',
                    dt: '2026-10-04',
                    keys: ['load.jsonl'],
                },
                columns: queryEventsCompactedColumns,
            });
            const started = performance.now();
            await db.run(
                sql
                    .replace("'s3://test/load.jsonl'", literal(raw))
                    .replace(
                        /TO 's3:\/\/test\/[^']+'/u,
                        `TO ${literal(parquet)}`,
                    ),
            );
            const compactMs = performance.now() - started;
            await db.run(
                `CREATE OR REPLACE VIEW query_events AS SELECT * FROM read_parquet(${literal(parquet)})`,
            );
            const queries = [];
            for (const dimensions of [
                [],
                ['semantic_usage_field_label', 'semantic_usage_role'],
                [
                    'semantic_usage_event_ts_day',
                    'semantic_usage_field_kind',
                    'semantic_usage_cache_hit',
                ],
            ]) {
                const start = performance.now();
                const rows = (
                    await db.runAndReadAll(compile(dimensions))
                ).getRowObjectsJson();
                queries.push({
                    dimensions,
                    durationMs: Math.round(performance.now() - start),
                    rows: rows.length,
                });
                expect(
                    rows.every(
                        (r) => Number(r.semantic_usage_total_queries) <= count,
                    ),
                ).toBe(true);
                if (dimensions.length === 0)
                    expect(rows[0].semantic_usage_total_queries).toBe(
                        String(count),
                    );
            }
            process.stdout.write(
                `${JSON.stringify({
                    semanticUsageLoad: {
                        count,
                        referencesPerQuery: usage.references.length,
                        compactMs: Math.round(compactMs),
                        queries,
                    },
                })}\n`,
            );
        },
        30_000,
    );
});
