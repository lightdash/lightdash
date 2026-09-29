/* eslint-disable no-await-in-loop -- Queries share one native DuckDB connection and must run sequentially. */
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
import { toolActivitySql } from './toolActivity';

const compile = (dimensions: string[], metrics: string[]) => {
    const explore = createAnalyticsExplores().find(
        (e) => e.name === 'tool_activity',
    )!;
    const result = new MetricQueryBuilder({
        explore,
        compiledMetricQuery: {
            exploreName: explore.name,
            dimensions,
            metrics: metrics.map((name) => `tool_activity_${name}`),
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

describe('Tool activity with real DuckDB', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:');
        db = await instance.connect();
        for (const stream of ['mcp_tool_calls', 'agent_steps'] as const) {
            await db.run(
                `CREATE TABLE ${stream} (${compactedStreamSchemas[stream].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
        }
        for (const dimension of ['users', 'agents'] as const) {
            await db.run(
                `CREATE TABLE ${usageDimensionTable(dimension)} (${usageDimensionSchemas[dimension].map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
        }
        await db.run(
            "INSERT INTO lightdash_users VALUES ('org', 'user', 'Alex'), ('other', 'user', 'Other tenant')",
        );
        await db.run(
            "INSERT INTO lightdash_agents VALUES ('org', 'agent', 'Agent')",
        );
        await db.run(`INSERT INTO mcp_tool_calls (org_id, project_id, user_id, actor_id, actor_type, event_ts, tool_call_id, tool_name, status, duration_ms, client_name) VALUES
            ('org','project','user','user','user','2026-09-28','same','list_explores','success',100,'Client'),
            ('org','project','user','user','user','2026-09-28','same','list_explores','success',100,'Client'),
            ('org','project',NULL,'service','service_account','2026-09-28','service','run_sql','error',200,NULL)`);
        await db.run(`INSERT INTO agent_steps (org_id, project_id, user_id, agent_id, event_ts, record_type, prompt_id, tool_call_id, tool_name, tool_status, tool_duration_ms) VALUES
            ('org','project','user','agent','2026-09-28','tool_call','prompt','same','run_query','success',300),
            ('org','project','user','agent','2026-09-28','tool_call','prompt','same','run_query','success',300),
            ('org','project',NULL,'agent','2026-09-28','tool_call','prompt','legacy','old_tool',NULL,400),
            ('org','project','user','agent','2026-09-28','step','prompt',NULL,NULL,NULL,500)`);
    });
    afterAll(() => {
        db?.closeSync();
        instance?.closeSync();
    });

    it('counts calls once, retains unknown outcomes, and computes the known-outcome error rate', async () => {
        const rows = (
            await db.runAndReadAll(
                compile(
                    [],
                    [
                        'total_calls',
                        'failed_calls',
                        'unique_users',
                        'unique_actors',
                        'avg_duration_ms',
                        'error_rate',
                    ],
                ),
            )
        ).getRowObjectsJson();
        expect(rows).toEqual([
            expect.objectContaining({
                tool_activity_total_calls: '4',
                tool_activity_failed_calls: '1',
                tool_activity_unique_users: '1',
                tool_activity_unique_actors: '2',
                tool_activity_avg_duration_ms: 250,
                tool_activity_error_rate: 1 / 3,
            }),
        ]);
    });

    it('executes dimension/metric combinations without join fanout or total changes', async () => {
        const groups = [
            [],
            ['tool_activity_source'],
            ['tool_activity_client_name'],
            ['tool_activity_tool_name'],
            ['tool_activity_status'],
            ['lightdash_users_name'],
            ['lightdash_agents_name'],
            ['tool_activity_event_ts_day'],
            ['tool_activity_actor_type'],
            [
                'tool_activity_source',
                'tool_activity_client_name',
                'lightdash_users_name',
                'tool_activity_event_ts_day',
            ],
        ];
        const metrics = [
            'total_calls',
            'failed_calls',
            'unique_users',
            'unique_actors',
            'avg_duration_ms',
            'p90_duration_ms',
            'error_rate',
        ];
        for (const dimensions of groups) {
            for (const selected of [...metrics.map((m) => [m]), metrics]) {
                const rows = (
                    await db.runAndReadAll(compile(dimensions, selected))
                ).getRowObjectsJson();
                expect(rows.length).toBeGreaterThan(0);
                if (selected.includes('total_calls'))
                    expect(
                        rows.reduce(
                            (sum, row) =>
                                sum + Number(row.tool_activity_total_calls),
                            0,
                        ),
                    ).toBe(4);
            }
        }
    });

    it('retains legacy calls without IDs, and supports an agent schema predating tool_status', async () => {
        await db.run('ALTER TABLE agent_steps DROP COLUMN tool_status');
        await db.run(
            "INSERT INTO agent_steps (org_id, event_ts, record_type) VALUES ('org','2026-09-28','tool_call'), ('org','2026-09-28','tool_call')",
        );
        expect(
            (
                await db.runAndReadAll(
                    `SELECT count(*) AS n FROM ${toolActivitySql}`,
                )
            ).getRowObjectsJson(),
        ).toEqual([{ n: '6' }]);
        await db.run('DELETE FROM mcp_tool_calls');
        await db.run('DELETE FROM agent_steps');
        const rows = (
            await db.runAndReadAll(compile([], ['total_calls', 'error_rate']))
        ).getRowObjectsJson();
        expect(rows).toEqual([
            { tool_activity_total_calls: '0', tool_activity_error_rate: null },
        ]);
    });
});
