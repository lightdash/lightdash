import { DuckDBInstance } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { contentViewsColumns } from '../eventStream/contentViewsStream';
import { embedReachSql } from './embedReach';

const compile = (dimensions: string[], metrics: string[]) =>
    new MetricQueryBuilder({
        explore: createAnalyticsExplores().find(
            ({ name }) => name === 'embed_reach',
        )!,
        compiledMetricQuery: {
            exploreName: 'embed_reach',
            dimensions: dimensions.map((name) => `embed_reach_${name}`),
            metrics: metrics.map((name) => `embed_reach_${name}`),
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

describe('Embed reach', () => {
    it('deduplicates captured loads, scopes viewer identities and excludes previews and internal traffic', async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            await db.run(
                `CREATE TABLE content_views (${contentViewsColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(`INSERT INTO content_views
                (event_name,org_id,project_id,event_id,event_ts,ingested_at,content_id,content_name,actor_type,view_context,external_user_id)
                VALUES
                ('embed_dashboard.viewed','org','p','one','2026-10-01','2026-10-01','d1','Revenue','embed','embed','alice'),
                ('embed_dashboard.viewed','org','p','one','2026-10-01','2026-10-02','d1','Revenue','embed','embed','alice'),
                ('embed_dashboard.viewed','org','p','reload','2026-10-01','2026-10-01','d1','Revenue','embed','embed','alice'),
                ('embed_dashboard.viewed','org','p','two','2026-10-02','2026-10-02','d2','Revenue','embed','embed','bob'),
                ('embed_dashboard.viewed','org','p','anonymous','2026-10-02','2026-10-02','d2','Revenue','embed','embed',NULL),
                ('embed_dashboard.viewed','org','p2','one','2026-10-02','2026-10-02','d1','Revenue','embed','embed','alice'),
                ('embed_dashboard.viewed','other','p','one','2026-10-02','2026-10-02','d1','Revenue','embed','embed','alice'),
                ('embed_dashboard.viewed','org','p','preview','2026-10-02','2026-10-02','d1','Revenue','embed','preview','ignored'),
                ('dashboard.view','org','p','internal','2026-10-02','2026-10-02','d1','Revenue','user','backend','ignored'),
                ('embed_dashboard.viewed','org','p',NULL,'2026-10-02','2026-10-02','d1','Revenue','embed','embed','ignored')`);
            const rows = (
                await db.runAndReadAll(
                    compile(
                        ['org_id'],
                        ['total_loads', 'unique_viewers', 'unique_dashboards'],
                    ),
                )
            ).getRowObjectsJson();
            expect(rows).toEqual(
                expect.arrayContaining([
                    {
                        embed_reach_org_id: 'org',
                        embed_reach_total_loads: '5',
                        embed_reach_unique_viewers: '3',
                        embed_reach_unique_dashboards: '3',
                    },
                    {
                        embed_reach_org_id: 'other',
                        embed_reach_total_loads: '1',
                        embed_reach_unique_viewers: '1',
                        embed_reach_unique_dashboards: '1',
                    },
                ]),
            );
            const coverage = (
                await db.runAndReadAll(
                    `SELECT identity_coverage, count(*)::INTEGER AS loads FROM ${embedReachSql} GROUP BY 1`,
                )
            ).getRowObjectsJson();
            expect(coverage).toContainEqual({
                identity_coverage: 'No external viewer ID',
                loads: 1,
            });
            const labels = (
                await db.runAndReadAll(
                    `SELECT DISTINCT dashboard_label FROM ${embedReachSql}`,
                )
            ).getRowObjectsJson();
            expect(labels).toHaveLength(2);
            expect(compile([], ['unique_viewers'])).not.toContain(
                'lightdash_users',
            );
            await db.run(
                `UPDATE content_views SET content_name = 'Renamed' WHERE event_id = 'reload'`,
            );
            expect(
                (
                    await db.runAndReadAll(
                        `SELECT DISTINCT dashboard_label FROM ${embedReachSql} WHERE org_id='org' AND project_id='p' AND dashboard_id='d1'`,
                    )
                ).getRowObjectsJson(),
            ).toHaveLength(1);
            await db.run(
                `UPDATE content_views SET external_user_id = ' alice ' WHERE event_id = 'reload'`,
            );
            const opaque = (
                await db.runAndReadAll(
                    `SELECT external_user_id, viewer_key FROM ${embedReachSql} WHERE event_id='reload'`,
                )
            ).getRowObjectsJson();
            expect(opaque).toEqual([
                {
                    external_user_id: ' alice ',
                    viewer_key: '["org","p"," alice "]',
                },
            ]);
            await db.run('DELETE FROM content_views');
            expect(
                (
                    await db.runAndReadAll(
                        compile([], ['total_loads', 'unique_viewers']),
                    )
                ).getRowObjectsJson(),
            ).toEqual([
                {
                    embed_reach_total_loads: '0',
                    embed_reach_unique_viewers: '0',
                },
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});
