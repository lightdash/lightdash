/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { contentInventoryColumns } from '../eventStream/contentInventory';
import { compactedStreamSchemas } from '../eventStream/registry';
import type { CompactedStreamColumn } from '../eventStream/types';

const compile = (dimensions: string[], metrics = ['total_content']) =>
    new MetricQueryBuilder({
        explore: createAnalyticsExplores().find(
            (e) => e.name === 'content_health',
        )!,
        compiledMetricQuery: {
            exploreName: 'content_health',
            dimensions: dimensions.map((d) => `content_health_${d}`),
            metrics: metrics.map((m) => `content_health_${m}`),
            filters: {},
            sorts: [],
            limit: 1000,
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

const schemas: Record<string, CompactedStreamColumn[]> = {
    lightdash_content: contentInventoryColumns,
    content_views: compactedStreamSchemas.content_views,
    query_events: compactedStreamSchemas.query_events,
    data_app_events: compactedStreamSchemas.data_app_events,
};

describe('Content health', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    const insert = async (
        table: string,
        row: Record<string, string | number | boolean | null>,
    ) => {
        const columns = schemas[table];
        const statement = await db.prepare(
            `INSERT INTO ${table} VALUES (${columns.map(() => '?').join(',')})`,
        );
        statement.bind(columns.map(({ name }) => row[name] ?? null));
        await statement.run();
        statement.destroySync();
    };
    beforeEach(async () => {
        instance = await DuckDBInstance.create(':memory:');
        db = await instance.connect();
        for (const [table, columns] of Object.entries(schemas)) {
            await db.run(
                `CREATE TABLE ${table} (${columns.map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
            );
        }
        for (const [id, type, deps, deleted] of [
            ['used', 'dashboard', 0, false],
            ['never', 'saved_chart', 0, false],
            ['indirect', 'saved_chart', 2, false],
            ['removed', 'sql_chart', 0, true],
            ['app', 'data_app', 0, false],
        ] as const)
            await insert('lightdash_content', {
                org_id: 'org',
                project_id: 'project',
                content_id: id,
                content_type: type,
                content_name: id,
                created_at: '2026-01-01',
                snapshot_at: '2026-09-30',
                is_deleted: deleted,
                dashboard_references: deps,
                enabled_schedules: 0,
                owner_status: 'Not recorded',
            });
    });
    afterEach(() => {
        db.closeSync();
        instance.closeSync();
    });

    it('retains zero-event and deleted inventory without claiming complete coverage', async () => {
        const rows = (
            await db.runAndReadAll(
                compile([
                    'content_name',
                    'is_deleted',
                    'activity_status',
                    'capture_coverage',
                    'dependency_coverage',
                ]),
            )
        ).getRowObjectsJson();
        expect(rows).toHaveLength(5);
        expect(
            rows.find((r) => r.content_health_content_name === 'indirect')
                ?.content_health_activity_status,
        ).toBe('No activity observed; known dependency');
        expect(
            rows.find((r) => r.content_health_content_name === 'removed')
                ?.content_health_is_deleted,
        ).toBe(true);
        expect(
            rows.every((r) =>
                String(r.content_health_capture_coverage).startsWith(
                    'Incomplete:',
                ),
            ),
        ).toBe(true);
    });

    it('aggregates before joining, deduplicates stable identities, and isolates organizations and projects', async () => {
        const view = {
            org_id: 'org',
            project_id: 'project',
            content_id: 'used',
            content_type: 'dashboard',
            user_id: 'reader',
            event_name: 'dashboard.view',
            event_id: 'one',
            event_ts: '2026-09-20',
            ingested_at: '2026-09-20',
            is_qualifying: true,
            actor_type: 'user',
        };
        await insert('content_views', view);
        await insert('content_views', view);
        await insert('content_views', {
            ...view,
            event_id: 'two',
            event_ts: '2026-09-21',
        });
        await insert('content_views', {
            ...view,
            org_id: 'other',
            event_id: 'other',
        });
        await insert('content_views', {
            ...view,
            project_id: 'other',
            event_id: 'other-project',
        });
        const query = {
            org_id: 'org',
            project_id: 'project',
            dashboard_id: 'used',
            query_id: 'query',
            event_name: 'query.completed',
            event_ts: '2026-09-22',
            warehouse_execution_time_ms: 100,
        };
        await insert('query_events', query);
        await insert('query_events', query);
        await insert('data_app_events', {
            org_id: 'org',
            project_id: 'project',
            app_id: 'app',
            event_name: 'data_app.view',
            event_ts: '2026-09-23',
        });
        const metrics = [
            'total_content',
            'total_observed_views',
            'total_observed_queries',
            'total_observed_app_loads',
            'total_warehouse_execution_time_ms',
            'total_queries_with_execution_time',
        ];
        for (const dimensions of [
            [],
            ['content_type'],
            ['content_id', 'activity_status'],
            ['owner_status', 'is_deleted'],
            ['created_at_month', 'project_id'],
        ]) {
            const rows = (
                await db.runAndReadAll(compile(dimensions, metrics))
            ).getRowObjectsJson();
            const sum = (metric: string) =>
                rows.reduce(
                    (total, r) =>
                        total + Number(r[`content_health_${metric}`] ?? 0),
                    0,
                );
            expect(sum('total_content')).toBe(5);
            expect(sum('total_observed_views')).toBe(2);
            expect(sum('total_observed_queries')).toBe(1);
            expect(sum('total_observed_app_loads')).toBe(1);
            expect(sum('total_warehouse_execution_time_ms')).toBe(100);
            expect(sum('total_queries_with_execution_time')).toBe(1);
        }
        const rows = (
            await db.runAndReadAll(
                compile([
                    'content_id',
                    'observed_viewers',
                    'last_observed_activity_at',
                    'first_observed_event_at',
                ]),
            )
        ).getRowObjectsJson();
        expect(
            rows.find((r) => r.content_health_content_id === 'used')
                ?.content_health_observed_viewers,
        ).toBe('1');
    });

    it('supports missing inventory during rollout', async () => {
        await db.run('DELETE FROM lightdash_content');
        const rows = (await db.runAndReadAll(compile([]))).getRowObjectsJson();
        expect(rows).toEqual([{ content_health_total_content: '0' }]);
    });
});
