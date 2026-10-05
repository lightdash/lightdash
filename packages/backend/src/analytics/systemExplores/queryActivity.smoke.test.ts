/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { createServer } from 'http';
import { tmpdir } from 'os';
import path from 'path';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { queryEventsCompactedColumns } from '../eventStream/queryEventsStream';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../eventStream/usageDimensions';
import { buildCompactionSql } from '../eventStream/UsageEventsCompactor';

const compile = (dimensions: string[], metrics: string[]) =>
    new MetricQueryBuilder({
        explore: createAnalyticsExplores().find(
            (e) => e.name === 'query_events',
        )!,
        compiledMetricQuery: {
            exploreName: 'query_events',
            dimensions,
            metrics: metrics.map((m) => `query_events_${m}`),
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            compiledAdditionalMetrics: [],
            compiledTableCalculations: [],
            compiledCustomDimensions: [],
        },
        warehouseSqlBuilder: warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB),
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery().query;

// Opt-in native HTTP reader check: requires the DuckDB httpfs extension.
it.skipIf(!process.env.QUERY_ACTIVITY_SMOKE)(
    'compacts 100k events and queries old-only/mixed Parquet through managed Explore views',
    async () => {
        const directory = await mkdtemp(path.join(tmpdir(), 'query-activity-'));
        const instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '256MB',
            threads: '2',
        });
        const db = await instance.connect();
        const server = createServer();
        const raw = path.join(directory, 'raw.jsonl');
        const current = path.join(directory, 'current.parquet');
        const historical = path.join(directory, 'historical.parquet');
        const users = path.join(directory, 'users.parquet');
        const started = Date.now();
        try {
            // Historical data deliberately has none of the additive attribution/timing columns.
            await db.run(`COPY (SELECT 'query.completed' AS event_name, 'org-a' AS org_id,
            'legacy-' || i AS query_id, NULL::VARCHAR AS user_id,
            TIMESTAMP '2026-09-29' AS event_ts, 'success' AS status,
            100::BIGINT AS warehouse_execution_time_ms FROM range(100) t(i))
            TO '${historical}' (FORMAT PARQUET)`);
            await db.run(`COPY (SELECT 'query.completed' AS event_name, 'org-a' AS org_id,
            'query-' || i AS query_id, CASE WHEN i % 5 = 0 THEN NULL ELSE 'user-' || (i % 2) END AS user_id,
            TIMESTAMP '2026-09-30' AS event_ts, 'chart-a' AS chart_id, 'dashboard-a' AS dashboard_id,
            'tile-' || (i % 2) AS dashboard_tile_id, 'project-a' AS project_id,
            ['interactive', 'scheduled', 'autorefresh', 'agent', 'app', 'mcp', 'unknown'][1 + (i % 7)] AS workload_origin,
            CASE WHEN i % 10 = 0 THEN 'error' ELSE 'success' END AS status,
            i % 2 = 0 AS cache_hit, 250::BIGINT + (i % 100) AS response_time_ms,
            'request' AS response_timing_basis, CASE WHEN i % 2 = 0 THEN 0 ELSE 100 END AS warehouse_execution_time_ms
            FROM range(100000) t(i)) TO '${raw}' (FORMAT JSON)`);
            const { sql } = buildCompactionSql({
                bucket: 'test',
                partition: {
                    orgId: 'org-a',
                    stream: 'query_events',
                    dt: '2026-09-30',
                    keys: ['raw.jsonl'],
                },
                columns: queryEventsCompactedColumns,
            });
            await db.run(
                sql
                    .replace("'s3://test/raw.jsonl'", `'${raw}'`)
                    .replace(/TO 's3:\/\/test\/[^']+'/u, `TO '${current}'`),
            );
            const compactionMs = Date.now() - started;
            await db.run(
                `COPY (SELECT 'org-a' AS org_id, 'user-' || i AS user_id, 'User ' || i AS name FROM range(2) t(i) UNION ALL SELECT 'org-b', 'user-0', 'Other organization') TO '${users}' (FORMAT PARQUET)`,
            );
            const files = new Map([
                ['/org-a/historical.parquet', await readFile(historical)],
                ['/org-a/current.parquet', await readFile(current)],
                ['/org-a/users.parquet', await readFile(users)],
            ]);
            server.on('request', (req, res) => {
                const file = files.get(
                    new URL(req.url!, 'http://localhost').pathname,
                );
                if (!file) {
                    res.writeHead(404).end();
                    return;
                }
                const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
                const start = range ? Number(range[1]) : 0;
                const end = range?.[2] ? Number(range[2]) : file.length - 1;
                res.writeHead(range ? 206 : 200, {
                    'Content-Length': end - start + 1,
                    'Accept-Ranges': 'bytes',
                    ...(range
                        ? {
                              'Content-Range': `bytes ${start}-${end}/${file.length}`,
                          }
                        : {}),
                });
                res.end(
                    req.method === 'HEAD'
                        ? undefined
                        : file.subarray(start, end + 1),
                );
            });
            await new Promise<void>((resolve) => {
                server.listen(0, '127.0.0.1', resolve);
            });
            const address = server.address();
            if (!address || typeof address === 'string')
                throw new Error('Missing loopback port');
            const scope = `http://127.0.0.1:${address.port}/org-a/`;
            let names = ['historical'];
            const client = new DuckdbWarehouseClient({
                type: 'duckdb_parquet',
                resolveSource: async () => ({
                    scope,
                    signedUrls: true,
                    tables: [
                        {
                            name: 'query_events',
                            columns: queryEventsCompactedColumns,
                            urls: names.map(
                                (name) =>
                                    `${scope}${name}.parquet?X-Amz-Signature=local-test`,
                            ),
                        },
                        {
                            name: 'lightdash_users',
                            columns: usageDimensionSchemas.users,
                            urls: [
                                `${scope}users.parquet?X-Amz-Signature=local-test`,
                            ],
                        },
                    ],
                    emptyTables: Object.entries(usageDimensionSchemas)
                        .filter(([name]) => name !== 'users')
                        .map(([name, columns]) => ({
                            name: usageDimensionTable(
                                name as keyof typeof usageDimensionSchemas,
                            ),
                            columns,
                        })),
                }),
            });
            const totals = [
                'total_queries',
                'avg_response_time_ms',
                'p50_response_time_ms',
                'p90_response_time_ms',
                'p95_response_time_ms',
                'avg_warehouse_execution_time_ms',
            ];
            const old = await client.runQuery(compile([], totals));
            expect(Number(old.rows[0].query_events_total_queries)).toBe(100);
            expect(old.rows[0].query_events_avg_response_time_ms).toBeNull();
            expect(
                Number(
                    old.rows[0].query_events_avg_warehouse_execution_time_ms,
                ),
            ).toBe(100);
            names = ['historical', 'current'];
            const mixed = await client.runQuery(compile([], totals));
            expect(Number(mixed.rows[0].query_events_total_queries)).toBe(
                100100,
            );
            expect(
                Number(mixed.rows[0].query_events_avg_response_time_ms),
            ).toBe(299.5);
            expect(
                Number(mixed.rows[0].query_events_p50_response_time_ms),
            ).toBe(299.5);
            for (const dimensions of [
                ['workload_origin'],
                ['dashboard_id', 'dashboard_tile_id'],
                ['event_ts_day', 'workload_origin', 'cache_hit', 'status'],
                ['user_id', 'response_timing_basis'],
            ]) {
                const result = await client.runQuery(
                    compile(
                        dimensions.map((d) => `query_events_${d}`),
                        totals,
                    ),
                );
                expect(
                    result.rows.reduce(
                        (sum, row) =>
                            sum + Number(row.query_events_total_queries),
                        0,
                    ),
                ).toBe(100100);
            }
            const joined = await client.runQuery(
                compile(
                    ['lightdash_users_name', 'query_events_workload_origin'],
                    totals,
                ),
            );
            expect(
                joined.rows.reduce(
                    (sum, row) => sum + Number(row.query_events_total_queries),
                    0,
                ),
            ).toBe(100100);
            expect(
                new Set(joined.rows.map((row) => row.lightdash_users_name)),
            ).toEqual(
                new Set([
                    'User 0',
                    'User 1',
                    'User not recorded',
                    'Scheduled activity',
                    'AI activity',
                ]),
            );
            const countsByName = joined.rows.reduce<Record<string, number>>(
                (counts, row) => {
                    const name = String(row.lightdash_users_name);
                    return {
                        ...counts,
                        [name]:
                            (counts[name] ?? 0) +
                            Number(row.query_events_total_queries),
                    };
                },
                {},
            );
            expect(countsByName).toEqual({
                'User 0': 40000,
                'User 1': 40000,
                'User not recorded': 14386,
                'Scheduled activity': 2857,
                'AI activity': 2857,
            });
            // A second session rebinds the same files without duplicated materialization.
            expect(
                (await client.runQuery(compile([], ['total_queries']))).rows,
            ).toEqual([{ query_events_total_queries: '100100' }]);
            process.stdout.write(
                `Query activity: 100000 new + 100 historical rows; compaction ${compactionMs}ms / ${files.get('/org-a/current.parquet')!.length} bytes; managed queries ${Date.now() - started - compactionMs}ms\n`,
            );
        } finally {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
            db.closeSync();
            instance.closeSync();
            await rm(directory, { recursive: true, force: true });
        }
    },
    60000,
);
