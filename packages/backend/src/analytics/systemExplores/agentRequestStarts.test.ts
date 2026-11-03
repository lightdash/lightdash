/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
    FilterOperator,
    WarehouseTypes,
    type ChartAsCode,
    type Filters,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../eventStream/usageDimensions';
import { analyticsContentAsCode } from './sampleContent';

const charts = analyticsContentAsCode
    .flatMap((bundle) => bundle.charts)
    .filter(({ slug }) => slug.includes('-adoption-ask-ai-'));
const compile = (
    chart: ChartAsCode,
    exploreName: string,
    filters: Filters = chart.metricQuery.filters as Filters,
) => {
    const explore = createAnalyticsExplores().find(
        ({ name }) => name === exploreName,
    )!;
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        WarehouseTypes.DUCKDB,
    );
    const result = new MetricQueryBuilder({
        explore,
        compiledMetricQuery: compileMetricQuery({
            explore,
            metricQuery: { ...chart.metricQuery, exploreName, filters },
            warehouseSqlBuilder,
            availableParameters: [],
        }),
        warehouseSqlBuilder,
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery();
    expect(result.warnings).toEqual([]);
    return result.query;
};

describe('request-start adoption queries with real DuckDB', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;

    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        db = await instance.connect();
        for (const stream of ['agent_request_events', 'ai_usage'] as const) {
            await db.run(
                `CREATE TABLE ${stream} (${compactedStreamSchemas[stream].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
        }
        for (const dimension of ['users', 'agents'] as const) {
            await db.run(
                `CREATE TABLE ${usageDimensionTable(dimension)} (${usageDimensionSchemas[dimension].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
        }
        await db.run(`INSERT INTO lightdash_users (org_id, user_id, name) VALUES
            ('org-a','person','Alex'), ('org-b','person','Other tenant')`);
        await db.run(`INSERT INTO lightdash_agents VALUES
            ('org-a','agent','Assistant'), ('org-b','agent','Other assistant')`);
        await db.run(`INSERT INTO agent_request_events
            (org_id, project_id, user_id, agent_id, prompt_id, event_id, event_ts, stage, outcome, surface) VALUES
            ('org-a','project','person','agent','one','versioned','2026-09-28 09:00:00','created',NULL,'slack'),
            ('org-a','project','person','agent','one','versioned','2026-09-28 10:00:00','created',NULL,'web_app'),
            ('org-a','project','person','agent','one','duplicate-start','2026-09-28 11:00:00','created',NULL,'slack'),
            ('org-a','project','person','agent','one','retry','2026-09-28 12:00:00','retry_started',NULL,NULL),
            ('org-a','project','person','agent','one','failure','2026-09-28 12:01:00','outcome','error',NULL),
            ('org-a','project','person','agent','one','failure','2026-09-28 12:01:00','outcome','error',NULL),
            ('org-a','project','person','agent','two','created-two','2026-09-29 10:00:00','created',NULL,'web_app'),
            ('org-a','project',NULL,NULL,'anonymous','created-anon','2026-09-29 11:00:00','created',NULL,'web_app'),
            ('org-a','project','missing','missing','missing','created-missing','2026-09-29 12:00:00','created',NULL,'web_app'),
            ('org-a','project','person','agent','unknown-surface','created-unknown','2026-09-29 13:00:00','created',NULL,NULL),
            ('org-a','project','person','agent','slack','created-slack','2026-09-29 14:00:00','created',NULL,'slack'),
            ('org-a','project','person','agent','orphan','outcome-only','2026-09-29 15:00:00','outcome','success','web_app'),
            ('org-a','project','person','agent',NULL,'no-prompt','2026-09-29 16:00:00','created',NULL,'web_app'),
            ('org-a','project','person','agent','no-event',NULL,'2026-09-29 17:00:00','created',NULL,'web_app'),
            ('org-b','project','person','agent','one','versioned','2026-09-30 10:00:00','created',NULL,'web_app')`);
        await db.run(`INSERT INTO ai_usage
            (org_id, project_id, prompt_id, event_id, event_ts, total_tokens) VALUES
            ('org-a','project','one','call','2026-09-28 10:00:01',100),
            ('org-a','project','one','call','2026-09-28 10:00:01',100)`);
    });

    afterAll(() => {
        db?.closeSync();
        instance?.closeSync();
    });

    it('switches exactly the five charts while retaining legacy field references', () => {
        expect(charts).toHaveLength(5);
        for (const chart of charts) {
            expect(chart.tableName).toBe('agent_request_starts');
            expect(chart.metricQuery.exploreName).toBe('agent_request_starts');
            expect(JSON.stringify(chart.metricQuery)).not.toContain(
                'agent_request_starts_',
            );
        }
        const users = charts.find(({ slug }) => slug.endsWith('-users'))!;
        expect(users.metricQuery.dimensions).toContain(
            'agent_requests_user_email',
        );
        expect(users.metricQuery.metrics).toContain(
            'agent_requests_activity_origin',
        );
        expect(users.metricQuery.additionalMetrics).toContainEqual(
            expect.objectContaining({
                table: 'agent_requests',
                name: 'activity_origin',
            }),
        );
        expect(users.metricQuery.tableCalculations).toContainEqual(
            expect.objectContaining({
                name: 'user_display_name',
                sql: expect.stringContaining('${agent_requests.user_email}'),
            }),
        );
        expect(users.tableConfig?.columnOrder).toContain('user_display_name');
    });

    it.each(charts.map((chart) => [chart.slug, chart] as const))(
        'preserves exact results and source selection for %s',
        async (_, chart) => {
            const originalSql = compile(chart, 'agent_requests');
            const sql = compile(chart, 'agent_request_starts');
            expect(db.getTableNames(originalSql, false)).toContain('ai_usage');
            expect(db.getTableNames(sql, false)).not.toContain('ai_usage');
            expect(sql).not.toMatch(/latest_status|consumption|retry_overhead/);
            const canonical = (rows: Record<string, unknown>[]) =>
                rows.map((row) => JSON.stringify(row)).sort();
            const original = (
                await db.runAndReadAll(originalSql)
            ).getRowObjectsJson();
            const result = (await db.runAndReadAll(sql)).getRowObjectsJson();
            expect(result.length).toBeGreaterThan(0);
            expect(canonical(result)).toEqual(canonical(original));
        },
    );

    it('deduplicates event versions before choosing the earliest prompt start', async () => {
        const explore = createAnalyticsExplores().find(
            ({ name }) => name === 'agent_request_starts',
        )!;
        const rows = (
            await db.runAndReadAll(
                `SELECT org_id, prompt_id, requested_at, surface FROM ${explore.tables.agent_requests.sqlTable} ORDER BY org_id, prompt_id`,
            )
        ).getRowObjectsJson();
        expect(rows).toHaveLength(7);
        expect(
            rows.find(
                (row) => row.org_id === 'org-a' && row.prompt_id === 'one',
            ),
        ).toMatchObject({
            requested_at: '2026-09-28 10:00:00',
            surface: 'web_app',
        });
        expect(rows.some((row) => row.prompt_id === 'orphan')).toBe(false);
        expect(rows.filter((row) => row.prompt_id === 'one')).toHaveLength(2);
    });

    it('counts weekly requesters exactly, retaining unidentified questions', async () => {
        const people = charts.find(({ slug }) => slug.endsWith('-people'))!;
        const result = (
            await db.runAndReadAll(compile(people, 'agent_request_starts'))
        ).getRowObjectsJson();
        expect(result).toEqual([
            expect.objectContaining({
                agent_requests_distinct_requesters: '2',
            }),
        ]);
        const questions = charts.find(({ slug }) =>
            slug.endsWith('-questions'),
        )!;
        const daily = (
            await db.runAndReadAll(compile(questions, 'agent_request_starts'))
        ).getRowObjectsJson();
        expect(
            daily.map((row) => Number(row.agent_requests_total_requests)),
        ).toEqual([1, 3, 1]);
    });

    it('preserves valid and unknown creation dates without inventing starts', async () => {
        await db.run('BEGIN');
        try {
            await db.run(`INSERT INTO agent_request_events
                (org_id, project_id, prompt_id, event_id, event_ts, stage) VALUES
                ('dates','project','valid','unknown-date',NULL,'created'),
                ('dates','project','valid','valid-date','2026-09-28','created'),
                ('dates','project','unknown','null-date',NULL,'created')`);
            const explores = createAnalyticsExplores();
            const dates = async (name: string) =>
                (
                    await db.runAndReadAll(
                        `SELECT prompt_id, requested_at FROM ${explores.find((explore) => explore.name === name)!.tables.agent_requests.sqlTable} WHERE org_id = 'dates' ORDER BY prompt_id`,
                    )
                ).getRowObjectsJson();
            expect(await dates('agent_request_starts')).toEqual(
                await dates('agent_requests'),
            );
            expect(await dates('agent_request_starts')).toEqual([
                { prompt_id: 'unknown', requested_at: null },
                { prompt_id: 'valid', requested_at: '2026-09-28 00:00:00' },
            ]);
        } finally {
            await db.run('ROLLBACK');
        }
    });

    it('preserves results for legacy field filters', async () => {
        const chart = charts.find(({ slug }) => slug.endsWith('-users'))!;
        for (const [fieldId, values] of [
            ['agent_requests_user_id', ['person']],
            ['agent_requests_agent_id', ['agent']],
            ['agent_requests_user_name', ['Alex']],
            ['agent_requests_agent_name', ['Assistant']],
        ] as const) {
            const filters: Filters = {
                dimensions: {
                    id: 'legacy',
                    and: [
                        {
                            id: 'old-filter',
                            target: { fieldId },
                            operator: FilterOperator.EQUALS,
                            values: [...values],
                        },
                    ],
                },
            };
            expect(
                (
                    await db.runAndReadAll(
                        compile(chart, 'agent_request_starts', filters),
                    )
                ).getRowObjectsJson(),
            ).toEqual(
                (
                    await db.runAndReadAll(
                        compile(chart, 'agent_requests', filters),
                    )
                ).getRowObjectsJson(),
            );
        }
    });

    it('needs neither token data nor unused lookup tables for question counts', async () => {
        const chart = charts.find(({ slug }) => slug.endsWith('-questions'))!;
        expect([
            ...db.getTableNames(compile(chart, 'agent_request_starts'), false),
        ]).toEqual(['agent_request_events']);
    });

    it('returns the same empty result for all five charts without AI usage', async () => {
        const empty = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const connection = await empty.connect();
        try {
            await connection.run(
                `CREATE TABLE agent_request_events (${compactedStreamSchemas.agent_request_events.map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
            for (const dimension of ['users', 'agents'] as const) {
                await connection.run(
                    `CREATE TABLE ${usageDimensionTable(dimension)} (${usageDimensionSchemas[dimension].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
                );
            }
            for (const chart of charts) {
                expect(
                    (
                        await connection.runAndReadAll(
                            compile(chart, 'agent_request_starts'),
                        )
                    ).getRowObjectsJson(),
                ).toEqual([]);
            }
        } finally {
            connection.closeSync();
            empty.closeSync();
        }
    });
});
