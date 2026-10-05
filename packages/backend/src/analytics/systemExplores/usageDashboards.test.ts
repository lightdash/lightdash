/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance } from '@duckdb/node-api';
import {
    WarehouseTypes,
    type ChartAsCode,
    type Filters,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import {
    usageDimensionSchemas,
    usageDimensionTable,
} from '../eventStream/usageDimensions';
import { userActivityColumns } from '../eventStream/userActivity';
import { analyticsContentAsCode } from './sampleContent';

const charts = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
const explores = createAnalyticsExplores();
const compile = (chart: ChartAsCode) =>
    new MetricQueryBuilder({
        explore: explores.find(({ name }) => name === chart.tableName)!,
        compiledMetricQuery: {
            ...chart.metricQuery,
            filters: chart.metricQuery.filters as Filters,
            compiledAdditionalMetrics: [],
            compiledTableCalculations: [],
            compiledCustomDimensions: [],
        },
        warehouseSqlBuilder: warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB),
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery();

describe('built-in usage dashboards', () => {
    it.each(charts.map((chart) => [chart.slug, chart] as const))(
        'compiles %s without missing fields or join warnings',
        (_slug, chart) => {
            expect(compile(chart).warnings).toEqual([]);
            expect(chart.metricQuery.limit).toBeLessThanOrEqual(5000);
        },
    );

    it('executes every chart on empty history and keeps app-name joins isolated without fanout', async () => {
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            const tables = {
                ...compactedStreamSchemas,
                user_activity: userActivityColumns,
                ...Object.fromEntries(
                    Object.entries(usageDimensionSchemas).map(
                        ([name, columns]) => [
                            usageDimensionTable(
                                name as keyof typeof usageDimensionSchemas,
                            ),
                            columns,
                        ],
                    ),
                ),
            };
            for (const [name, columns] of Object.entries(tables)) {
                await db.run(
                    `CREATE TABLE "${name}" (${columns.map((column) => `"${column.name}" ${column.type}`).join(', ')})`,
                );
            }
            for (const chart of charts)
                await db.runAndReadAll(compile(chart).query);
            await db.run(`INSERT INTO data_app_events (org_id, project_id, app_id, user_id, event_name, event_ts) VALUES
                ('org-a','project-a','app-a','person-a','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a','app-a',NULL,'data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a','historical-app','person-a','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a','app-b','person-b','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-b','app-a','person-a','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a',NULL,NULL,'data_app.view',CURRENT_TIMESTAMP)`);
            await db.run(`INSERT INTO lightdash_content (org_id, project_id, content_type, content_id, content_name) VALUES
                ('org-a','project-a','data_app','app-a','Shared name'),
                ('org-a','project-a','data_app','app-b','Shared name'),
                ('org-a','project-b','data_app','app-a','Other project'),
                ('org-b','project-a','data_app','app-a','Other organization'),
                ('org-a','project-a','dashboard','app-a','Different content type')`);
            const appChart = charts.find(
                ({ slug }) => slug === 'lightdash-analytics-apps-top-apps',
            )!;
            const rows = (
                await db.runAndReadAll(compile(appChart).query)
            ).getRowObjects();
            expect(rows).toHaveLength(5);
            expect(
                rows.reduce(
                    (sum, row) => sum + Number(row.data_app_events_total_views),
                    0,
                ),
            ).toBe(6);
            expect(
                rows.filter((row) => row.lightdash_apps_name === 'Shared name'),
            ).toHaveLength(2);
            expect(rows.map((row) => row.lightdash_apps_name)).toEqual(
                expect.arrayContaining([
                    'historical-app',
                    'Unknown app',
                    'Other project',
                ]),
            );
            expect(rows.map((row) => row.lightdash_apps_name)).not.toContain(
                'Other organization',
            );
            await db.run('DELETE FROM lightdash_content');
            const withoutInventory = (
                await db.runAndReadAll(compile(appChart).query)
            ).getRowObjects();
            expect(
                withoutInventory.reduce(
                    (sum, row) => sum + Number(row.data_app_events_total_views),
                    0,
                ),
            ).toBe(6);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});
