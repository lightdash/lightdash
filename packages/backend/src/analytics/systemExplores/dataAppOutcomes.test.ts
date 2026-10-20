import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import { usageDimensionSchemas } from '../eventStream/usageDimensions';

const compile = (
    exploreName: 'data_app_outcomes' | 'data_app_reach' | 'data_app_events',
    dimensions: string[],
    metrics: string[],
) => {
    const explore = createAnalyticsExplores().find(
        ({ name }) => name === exploreName,
    )!;
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery: {
            exploreName,
            dimensions,
            metrics: metrics.map((name) => `${exploreName}_${name}`),
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

describe('Data app outcomes', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;
    let directory: string;
    const query = async (dimensions: string[], metrics: string[]) =>
        (
            await db.runAndReadAll(
                compile('data_app_outcomes', dimensions, metrics),
            )
        ).getRowObjectsJS();

    beforeAll(async () => {
        directory = await mkdtemp(path.join(tmpdir(), 'data-app-outcomes-'));
        instance = await DuckDBInstance.create(':memory:', { threads: '1' });
        db = await instance.connect();
        const oldFile = path.join(directory, 'old.parquet');
        const newFile = path.join(directory, 'new.parquet');
        await db.run(`COPY (SELECT 'data_app.view' AS event_name,
            'org' AS org_id, 'project' AS project_id, 'app' AS app_id,
            'old-user' AS user_id, TIMESTAMP '2026-10-01' AS event_ts)
            TO '${oldFile}' (FORMAT PARQUET)`);
        await db.run(
            `CREATE TABLE new_events (${compactedStreamSchemas.data_app_events.map(({ name, type }) => `"${name}" ${type}`).join(',')})`,
        );
        await db.run(`INSERT INTO new_events
            (event_name,org_id,project_id,app_id,user_id,event_ts,version,view_context,navigation_id,outcome) VALUES
            ('data_app.view','org','project','app','reader','2026-10-02',1,'standalone','nav-1',NULL),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',1,'standalone','nav-1','html_loaded'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',1,'standalone','nav-1','html_loaded'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',1,'standalone','nav-1','sdk_started'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',1,'standalone','nav-1','runtime_error'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-03',1,'standalone','nav-1','runtime_error'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',1,'standalone','nav-2','html_error'),
            ('data_app.view_outcome','org','project','app','issuer','2026-10-02',1,'embed','nav-3','sdk_started'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',1,'standalone',NULL,'runtime_error'),
            ('data_app.view_outcome','org','project','other-app','reader','2026-10-02',1,'dashboard','nav-1','sdk_started'),
            ('data_app.view_outcome','other-org','project','app','reader','2026-10-02',1,'standalone','nav-1','html_loaded'),
            ('data_app.view_outcome','org','other-project','app','reader','2026-10-02',1,'standalone','nav-1','html_loaded'),
            ('data_app.view_outcome','org','project','app','reader','2026-10-02',2,'builder','nav-1','html_loaded')`);
        await db.run(`COPY new_events TO '${newFile}' (FORMAT PARQUET)`);
        await db.run(`CREATE VIEW data_app_events AS
            SELECT * FROM read_parquet(['${oldFile}','${newFile}'],union_by_name=true,hive_partitioning=false)
            UNION ALL BY NAME SELECT ${compactedStreamSchemas.data_app_events.map(({ name, type }) => `NULL::${type} AS "${name}"`).join(',')} WHERE false`);
        for (const [name, columns] of [
            ['lightdash_content', usageDimensionSchemas.content],
            ['lightdash_users', usageDimensionSchemas.users],
        ] as const) {
            // eslint-disable-next-line no-await-in-loop
            await db.run(
                `CREATE TABLE ${name} (${columns.map((column) => `"${column.name}" ${column.type}`).join(',')})`,
            );
        }
        await db.run(`INSERT INTO lightdash_content
            (org_id,project_id,content_type,content_id,content_name) VALUES
            ('org','project','data_app','app','Sales app'),
            ('org','project','dashboard','app','Dashboard collision'),
            ('org','other-project','data_app','app','Other project app'),
            ('other-org','project','data_app','app','Other org app')`);
        await db.run(`INSERT INTO lightdash_users VALUES
            ('org','reader','Reader'),('org','issuer','Token issuer'),
            ('other-org','reader','Other org reader')`);
    });

    afterAll(async () => {
        db?.closeSync();
        instance?.closeSync();
        await rm(directory, { recursive: true, force: true });
    });

    it('deduplicates each outcome by scoped navigation, including late signals', async () => {
        expect(
            await query(
                [],
                [
                    'observed_navigations',
                    'html_loaded',
                    'html_error',
                    'sdk_started',
                    'runtime_error',
                    'total_signals',
                ],
            ),
        ).toEqual([
            {
                data_app_outcomes_observed_navigations: 7n,
                data_app_outcomes_html_loaded: 4n,
                data_app_outcomes_html_error: 1n,
                data_app_outcomes_sdk_started: 3n,
                data_app_outcomes_runtime_error: 1n,
                data_app_outcomes_total_signals: 12n,
            },
        ]);
    });

    it('retains signals without navigation identity without inventing a navigation', async () => {
        const rows = await query(
            ['data_app_outcomes_navigation_id'],
            ['observed_navigations', 'total_signals'],
        );
        expect(rows).toContainEqual({
            data_app_outcomes_navigation_id: null,
            data_app_outcomes_observed_navigations: 0n,
            data_app_outcomes_total_signals: 1n,
        });
    });

    it('keeps embedded viewers unattributed and scopes optional name joins', async () => {
        const rows = await query(
            [
                'lightdash_users_name',
                'lightdash_apps_name',
                'data_app_outcomes_user_id',
            ],
            ['total_signals'],
        );
        expect(rows).toEqual(
            expect.arrayContaining([
                {
                    lightdash_users_name: 'Unknown user',
                    lightdash_apps_name: 'Sales app',
                    data_app_outcomes_user_id: null,
                    data_app_outcomes_total_signals: 1n,
                },
                {
                    lightdash_users_name: 'Other org reader',
                    lightdash_apps_name: 'Other org app',
                    data_app_outcomes_user_id: 'reader',
                    data_app_outcomes_total_signals: 1n,
                },
                {
                    lightdash_users_name: 'Reader',
                    lightdash_apps_name: 'Other project app',
                    data_app_outcomes_user_id: 'reader',
                    data_app_outcomes_total_signals: 1n,
                },
            ]),
        );
        expect(
            rows.reduce(
                (sum, row) => sum + Number(row.data_app_outcomes_total_signals),
                0,
            ),
        ).toBe(12);
    });

    it('preserves historical loads and existing action metrics with mixed Parquet schemas', async () => {
        const loads = await db.runAndReadAll(
            compile('data_app_reach', [], ['total_loads', 'distinct_viewers']),
        );
        expect(loads.getRowObjectsJS()).toEqual([
            {
                data_app_reach_total_loads: 2n,
                data_app_reach_distinct_viewers: 2n,
            },
        ]);
        const activity = await db.runAndReadAll(
            compile(
                'data_app_events',
                [],
                [
                    'total_events',
                    'total_views',
                    'unique_viewers',
                    'unique_apps',
                ],
            ),
        );
        expect(activity.getRowObjectsJS()).toEqual([
            {
                data_app_events_total_events: 2n,
                data_app_events_total_views: 2n,
                data_app_events_unique_viewers: 2n,
                data_app_events_unique_apps: 1n,
            },
        ]);
    });

    it('keeps outcomes independent of existing load queries and optional name joins', () => {
        const outcomeSql = compile('data_app_outcomes', [], ['sdk_started']);
        expect(outcomeSql).not.toMatch(/lightdash_content|lightdash_users/);
        const loadSql = compile('data_app_reach', [], ['total_loads']);
        expect(loadSql).not.toMatch(/navigation_key|view_outcome|JOIN/);
    });
});
