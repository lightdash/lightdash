/* eslint-disable no-await-in-loop -- The native DuckDB connection is shared. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../eventStream/usageDimensions';

const compile = (dimensions: string[], metrics: string[]) => {
    const explore = createAnalyticsExplores().find(
        (e) => e.name === 'agent_requests',
    )!;
    const result = new MetricQueryBuilder({
        explore,
        compiledMetricQuery: {
            exploreName: explore.name,
            dimensions,
            metrics: metrics.map((name) => `agent_requests_${name}`),
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

describe('Agent requests with real DuckDB', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:');
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
        await db.run(`INSERT INTO lightdash_users VALUES
            ('org-a','user-a','Alex'), ('org-b','user-a','Other tenant')`);
        await db.run(`INSERT INTO lightdash_agents VALUES
            ('org-a','agent-a','Assistant'), ('org-b','agent-a','Other assistant')`);
        await db.run(`INSERT INTO agent_request_events
            (org_id, project_id, user_id, agent_id, thread_id, prompt_id, event_id, event_ts, stage, outcome, human_score, surface) VALUES
            ('org-a','project','user-a','agent-a','thread','prompt-1','created:prompt-1','2026-09-29 10:00:00','created',NULL,NULL,'web_app'),
            ('org-a','project','user-a','agent-a','thread','prompt-1','failure-1','2026-09-29 10:00:01','outcome','error',NULL,NULL),
            ('org-a','project','user-a','agent-a','thread','prompt-1','retry-1','2026-09-29 10:00:02','retry_started',NULL,NULL,NULL),
            ('org-a','project','user-a','agent-a','thread','prompt-1','success-1','2026-09-29 10:00:04','outcome','success',NULL,NULL),
            ('org-a','project','user-a','agent-a','thread','prompt-1','rating-1','2026-09-29 10:00:05','feedback_updated',NULL,1,NULL),
            ('org-a','project','user-a','agent-a','thread','prompt-1','rating-2','2026-09-29 10:00:06','feedback_updated',NULL,-1,NULL),
            ('org-a','project','user-a','agent-a','thread','prompt-1','success-1','2026-09-29 10:00:04','outcome','success',NULL,NULL),
            ('org-a','project',NULL,'agent-a','thread','prompt-2','created:prompt-2','2026-09-29 11:00:00','created',NULL,NULL,'slack'),
            ('org-a','project',NULL,'agent-a','thread','prompt-2','clarification-2','2026-09-29 11:00:03','clarification_requested',NULL,NULL,NULL),
            ('org-a','project','user-a','agent-a','thread','prompt-3','created:prompt-3','2026-09-29 12:00:00','created',NULL,NULL,'web_app'),
            ('org-a','project','user-a','agent-a','thread','orphan','orphan-outcome','2026-09-29 12:00:01','outcome','success',NULL,NULL),
            ('org-b','project','user-a','agent-a','thread','other','created:other','2026-09-29 13:00:00','created',NULL,NULL,'web_app')`);
        await db.run(`INSERT INTO ai_usage
            (org_id, project_id, agent_id, prompt_id, event_id, event_ts, total_tokens) VALUES
            ('org-a','project','agent-a','prompt-1','call-1','2026-09-29 10:00:01',100),
            ('org-a','project','agent-a','prompt-1','call-1','2026-09-29 10:00:01',100),
            ('org-a','project','agent-a','prompt-1','call-2','2026-09-29 10:00:03',50),
            ('org-a','project','agent-a','prompt-1','call-3','2026-09-29 10:00:03',NULL),
            ('org-a','project',NULL,'prompt-1','call-4','2026-09-29 10:00:03',25),
            ('org-b','project','agent-a','prompt-1','other-call','2026-09-29 10:00:03',900)`);
    });
    afterAll(() => {
        db?.closeSync();
        instance?.closeSync();
    });

    it('keeps one row per captured human request and deduplicates attempts and AI calls', async () => {
        const rows = (
            await db.runAndReadAll(
                compile(
                    ['agent_requests_prompt_id'],
                    [
                        'total_requests',
                        'total_retries',
                        'total_retry_overhead_ms',
                        'total_ai_calls',
                        'total_request_tokens',
                    ],
                ),
            )
        ).getRowObjectsJson();
        expect(rows).toHaveLength(4);
        expect(
            rows.find((row) => row.agent_requests_prompt_id === 'prompt-1'),
        ).toEqual(
            expect.objectContaining({
                agent_requests_total_requests: '1',
                agent_requests_total_retries: '1',
                agent_requests_total_retry_overhead_ms: '1000',
                agent_requests_total_ai_calls: '4',
                agent_requests_total_request_tokens: '175',
            }),
        );
        expect(
            rows.some((row) => row.agent_requests_prompt_id === 'orphan'),
        ).toBe(false);
    });

    it('uses the latest outcome and rating, with pending and unknown actors retained', async () => {
        const rows = (
            await db.runAndReadAll(
                compile(
                    ['agent_requests_status', 'lightdash_users_name'],
                    [
                        'total_requests',
                        'distinct_requesters',
                        'completion_rate',
                        'feedback_coverage',
                        'negative_feedback_rate',
                    ],
                ),
            )
        ).getRowObjectsJson();
        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    agent_requests_status: 'success',
                    lightdash_users_name: 'Alex',
                    agent_requests_total_requests: '1',
                    agent_requests_completion_rate: 1,
                    agent_requests_negative_feedback_rate: 1,
                }),
                expect.objectContaining({
                    agent_requests_status: 'clarification',
                    lightdash_users_name: 'Unknown user',
                    agent_requests_total_requests: '1',
                }),
            ]),
        );
    });

    it('preserves totals across common dimension and metric combinations', async () => {
        for (const dimensions of [
            [],
            ['agent_requests_status'],
            ['agent_requests_surface'],
            ['agent_requests_requested_at_day'],
            ['lightdash_users_name'],
            ['lightdash_agents_name'],
            [
                'agent_requests_status',
                'lightdash_users_name',
                'lightdash_agents_name',
            ],
        ]) {
            const rows = (
                await db.runAndReadAll(compile(dimensions, ['total_requests']))
            ).getRowObjectsJson();
            expect(
                rows.reduce(
                    (sum, row) =>
                        sum + Number(row.agent_requests_total_requests),
                    0,
                ),
            ).toBe(4);
        }
    });
});

it.skipIf(!process.env.AGENT_REQUESTS_LOAD_TEST)(
    'queries 100k requests with bounded DuckDB memory',
    async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '256MB',
            threads: '2',
        });
        const db = await instance.connect();
        try {
            for (const stream of [
                'agent_request_events',
                'ai_usage',
            ] as const) {
                await db.run(
                    `CREATE TABLE ${stream} (${compactedStreamSchemas[stream].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
                );
            }
            for (const dimension of ['users', 'agents'] as const) {
                await db.run(
                    `CREATE TABLE ${usageDimensionTable(dimension)} (${usageDimensionSchemas[dimension].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
                );
            }
            await db.run(`INSERT INTO agent_request_events
                (org_id, project_id, user_id, agent_id, prompt_id, event_id, event_ts, stage, outcome)
                SELECT 'org', 'project', 'user-' || (i % 1000), 'agent',
                    'prompt-' || i, 'created:prompt-' || i,
                    TIMESTAMP '2026-09-29' + INTERVAL (i % 86400) SECOND,
                    'created', NULL FROM range(100000) t(i)
                UNION ALL SELECT 'org', 'project', 'user-' || (i % 1000), 'agent',
                    'prompt-' || i, 'outcome-' || i,
                    TIMESTAMP '2026-09-29' + INTERVAL (i % 86400 + 2) SECOND,
                    'outcome', CASE WHEN i % 10 = 0 THEN 'error' ELSE 'success' END
                FROM range(100000) t(i)`);
            await db.run(`INSERT INTO ai_usage
                (org_id, project_id, agent_id, prompt_id, event_id, event_ts, total_tokens)
                SELECT 'org', 'project', 'agent', 'prompt-' || i,
                    'call-' || i, TIMESTAMP '2026-09-29', 100
                FROM range(100000) t(i)`);
            const started = Date.now();
            const rows = (
                await db.runAndReadAll(
                    compile(
                        [],
                        [
                            'total_requests',
                            'failed_requests',
                            'completion_rate',
                            'average_request_latency_ms',
                            'total_ai_calls',
                            'total_request_tokens',
                        ],
                    ),
                )
            ).getRowObjectsJson();
            expect(rows).toEqual([
                expect.objectContaining({
                    agent_requests_total_requests: '100000',
                    agent_requests_failed_requests: '10000',
                    agent_requests_completion_rate: 0.9,
                    agent_requests_total_ai_calls: '100000',
                    agent_requests_total_request_tokens: '10000000',
                }),
            ]);
            // eslint-disable-next-line no-console
            console.info(
                `Agent requests 100k query: ${Date.now() - started}ms`,
            );
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    },
);
