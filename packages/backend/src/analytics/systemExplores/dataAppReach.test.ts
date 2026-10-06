import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import { usageDimensionSchemas } from '../eventStream/usageDimensions';

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

describe('Data app reach from existing loads', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    const query = async (
        dimensions: string[],
        metrics = ['total_loads', 'distinct_viewers'],
    ) =>
        (
            await db.runAndReadAll(compile(dimensions, metrics))
        ).getRowObjectsJS();

    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:', { threads: '1' });
        db = await instance.connect();
        await Promise.all(
            (
                [
                    ['data_app_events', compactedStreamSchemas.data_app_events],
                    ['lightdash_content', usageDimensionSchemas.content],
                    ['lightdash_users', usageDimensionSchemas.users],
                ] as const
            ).map(([name, columns]) =>
                db.run(
                    `CREATE TABLE ${name} (${columns.map((c) => `"${c.name}" ${c.type}`).join(',')})`,
                ),
            ),
        );
        await db.run(`INSERT INTO data_app_events (event_name, org_id, project_id, app_id, user_id, event_ts, view_context) VALUES
            ('data_app.view','org','project','app','reader','2026-10-01','standalone'),
            ('data_app.view','org','project','app','reader','2026-10-01','standalone'),
            ('data_app.view','org','project','app','builder','2026-10-02','builder'),
            ('data_app.view','org','project','app','issuer','2026-10-02','embed'),
            ('data_app.view','org','project','deleted-app','deleted-user','2026-10-03',NULL),
            ('data_app.created','org','project','app','builder','2026-10-01',NULL)`);
        await db.run(`INSERT INTO lightdash_content (org_id, project_id, content_type, content_id, content_name, project_name) VALUES
            ('org','project','data_app','app','Sales app','Sales'),
            ('other','project','data_app','app','Other tenant','Other'),
            ('org','other-project','data_app','app','Other project','Other'),
            ('org','project','dashboard','app','Dashboard collision','Sales')`);
        await db.run(`INSERT INTO lightdash_users VALUES
            ('org','reader','Reader'), ('org','builder','Builder'),
            ('org','issuer','Token issuer'), ('other','reader','Other tenant')`);
    });
    afterAll(() => {
        db?.closeSync();
        instance?.closeSync();
    });

    it('counts existing loads including reloads, but excludes the embed issuer from known viewers', async () => {
        expect(
            await query([], ['total_loads', 'distinct_viewers', 'apps_loaded']),
        ).toEqual([
            {
                data_app_reach_total_loads: 5n,
                data_app_reach_distinct_viewers: 3n,
                data_app_reach_apps_loaded: 2n,
            },
        ]);
    });

    it('joins names without cross-tenant, cross-project or content-type fanout', async () => {
        const rows = await query([
            'lightdash_users_name',
            'lightdash_apps_name',
            'data_app_reach_user_id',
        ]);
        expect(rows).toHaveLength(4);
        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    lightdash_users_name: 'Reader',
                    lightdash_apps_name: 'Sales app',
                    data_app_reach_total_loads: 2n,
                }),
                expect.objectContaining({
                    lightdash_users_name: 'Unknown user',
                    lightdash_apps_name: 'deleted-app',
                    data_app_reach_user_id: 'deleted-user',
                }),
                expect.objectContaining({
                    lightdash_users_name: 'Unknown user',
                    data_app_reach_user_id: null,
                    data_app_reach_distinct_viewers: 0n,
                }),
            ]),
        );
    });

    it('preserves unknown historical context and separates reader-facing surfaces from previews', async () => {
        expect(await query(['data_app_reach_view_context'])).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    data_app_reach_view_context: 'standalone',
                    data_app_reach_total_loads: 2n,
                }),
                expect.objectContaining({
                    data_app_reach_view_context: 'builder',
                    data_app_reach_total_loads: 1n,
                }),
                expect.objectContaining({
                    data_app_reach_view_context: 'unknown',
                    data_app_reach_total_loads: 1n,
                }),
            ]),
        );
    });

    it.each(['day', 'week'] as const)(
        'queries named audiences by %s with all metrics',
        async (grain) => {
            const rows = await query(
                [
                    'lightdash_apps_name',
                    'lightdash_users_name',
                    `data_app_reach_event_ts_${grain}`,
                ],
                [
                    'total_loads',
                    'distinct_viewers',
                    'apps_loaded',
                    'last_loaded_at',
                ],
            );
            expect(rows.length).toBeGreaterThan(0);
            expect(
                rows.reduce(
                    (sum, row) => sum + Number(row.data_app_reach_total_loads),
                    0,
                ),
            ).toBe(5);
        },
    );

    it('reads only the event table when names are not requested', () => {
        const sql = compile([], ['total_loads']);
        expect(sql).toContain('data_app_events');
        expect(sql).not.toContain('lightdash_content');
        expect(sql).not.toContain('lightdash_users');
        expect(sql).not.toMatch(/ROW_NUMBER|OVER\s*\(/);
    });
});
