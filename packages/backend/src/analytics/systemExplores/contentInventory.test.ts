/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
    ChartType,
    FilterOperator,
    getDashboardFilterRulesForTables,
    getFields,
    getItemId,
    WarehouseTypes,
    type Filters,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { contentInventoryColumns } from '../eventStream/contentInventory';
import { compactedStreamSchemas } from '../eventStream/registry';
import { analyticsContentAsCode } from './sampleContent';

const charts = analyticsContentAsCode
    .flatMap((bundle) => bundle.charts)
    .filter(({ slug }) =>
        /-(content-creation-by-month|content-ownership-current-snapshot)$/.test(
            slug,
        ),
    );

const compile = (metricQuery: MetricQuery) => {
    const explore = createAnalyticsExplores().find(
        ({ name }) => name === metricQuery.exploreName,
    )!;
    const sqlBuilder = warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB);
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery: compileMetricQuery({
            explore,
            metricQuery,
            warehouseSqlBuilder: sqlBuilder,
            availableParameters: [],
        }),
        warehouseSqlBuilder: sqlBuilder,
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery();
};

const normalize = (rows: Record<string, unknown>[]) =>
    rows
        .map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                    key.replace(/^content_(health|inventory)_/, ''),
                    value,
                ]),
            ),
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe('Content inventory charts', () => {
    let instance: DuckDBInstance;
    let db: DuckDBConnection;

    beforeEach(async () => {
        instance = await DuckDBInstance.create(':memory:', { threads: '1' });
        db = await instance.connect();
        for (const [name, columns] of Object.entries({
            lightdash_content: contentInventoryColumns,
            content_views: compactedStreamSchemas.content_views,
            query_events: compactedStreamSchemas.query_events,
            data_app_events: compactedStreamSchemas.data_app_events,
        })) {
            await db.run(
                `CREATE TABLE ${name} (${columns.map((c) => `"${c.name}" ${c.type}`).join(',')})`,
            );
        }
        const rows = [
            { owner_status: 'Active organization member' },
            { owner_status: 'Not an organization member', is_deleted: true },
            { owner_status: 'Unknown user', owner_id: 'missing-user' },
            { owner_status: 'Unassigned', created_at: null },
            { owner_status: null, owner_id: null },
            { project_id: 'other-project', content_type: 'sql_chart' },
            { content_type: 'data_app', created_at: '2026-02-01' },
            { content_id: null, owner_status: 'Unassigned' },
        ];
        for (const row of rows) {
            const fixture: Record<string, unknown> = {
                org_id: 'org',
                project_id: 'project',
                content_type: 'dashboard',
                content_id: 'shared-id',
                created_at: '2026-01-01',
                is_deleted: false,
                ...row,
            };
            const statement = await db.prepare(
                `INSERT INTO lightdash_content VALUES (${contentInventoryColumns.map(() => '?').join(',')})`,
            );
            statement.bind(
                contentInventoryColumns.map(({ name }) => {
                    const value = fixture[name] ?? null;
                    if (
                        value === null ||
                        typeof value === 'string' ||
                        typeof value === 'boolean'
                    )
                        return value;
                    throw new Error(`Unsupported fixture value for ${name}`);
                }),
            );
            await statement.run();
            statement.destroySync();
        }
    });

    afterEach(() => {
        db.closeSync();
        instance.closeSync();
    });

    it('preserves legacy field IDs and existing chart filters', async () => {
        const chart = charts.find(({ slug }) =>
            slug.endsWith('-content-creation-by-month'),
        )!;
        expect(chart.metricQuery.dimensions).toEqual([
            'content_health_created_at_month',
        ]);
        expect(chart.metricQuery.metrics).toEqual([
            'content_health_total_content',
        ]);
        const explore = createAnalyticsExplores().find(
            ({ name }) => name === 'content_inventory',
        )!;
        const dashboardRule = {
            id: 'existing-dashboard-filter',
            label: 'Active content',
            target: {
                tableName: 'content_health',
                fieldId: 'content_health_is_deleted',
            },
            operator: FilterOperator.EQUALS,
            values: [false],
        };
        expect(
            getDashboardFilterRulesForTables(
                getFields(explore).map(getItemId),
                [dashboardRule],
            ),
        ).toEqual([dashboardRule]);
        const filtered = compile({
            ...chart.metricQuery,
            filters: {
                dimensions: {
                    id: 'existing-filter',
                    and: [
                        {
                            id: 'existing-rule',
                            target: { fieldId: 'content_health_is_deleted' },
                            operator: FilterOperator.EQUALS,
                            values: [false],
                        },
                    ],
                },
            },
        });
        expect(filtered.warnings).toEqual([]);
        const rows = (
            await db.runAndReadAll(filtered.query)
        ).getRowObjectsJson();
        expect(
            rows.reduce(
                (sum, row) => sum + Number(row.content_health_total_content),
                0,
            ),
        ).toBe(6);
    });

    it.each(charts)('preserves the results of $slug', async (chart) => {
        expect(chart.tableName).toBe('content_inventory');
        const creation = chart.slug.endsWith('-content-creation-by-month');
        const legacyDimension = creation ? 'created_at_month' : 'owner_status';
        for (const scenario of ['all', 'active', 'project', 'empty']) {
            if (scenario === 'empty')
                await db.run('DELETE FROM lightdash_content');
            const filters = (table: string): Filters =>
                scenario === 'active' || scenario === 'project'
                    ? {
                          dimensions: {
                              id: 'filters',
                              and: [
                                  {
                                      id: 'filter',
                                      target: {
                                          fieldId: `${table}_${scenario === 'active' ? 'is_deleted' : 'project_id'}`,
                                      },
                                      operator: FilterOperator.EQUALS,
                                      values:
                                          scenario === 'active'
                                              ? [false]
                                              : ['project'],
                                  },
                              ],
                          },
                      }
                    : {};
            const legacy = compile({
                ...chart.metricQuery,
                exploreName: 'content_health',
                dimensions: [`content_health_${legacyDimension}`],
                metrics: ['content_health_total_content'],
                sorts: [
                    {
                        fieldId: creation
                            ? 'content_health_created_at_month'
                            : 'content_health_total_content',
                        descending: !creation,
                    },
                ],
                filters: filters('content_health'),
            });
            const current = compile({
                ...chart.metricQuery,
                filters: filters('content_health'),
            });
            expect(current.warnings).toEqual([]);
            const before = (
                await db.runAndReadAll(legacy.query)
            ).getRowObjectsJson();
            const after = (
                await db.runAndReadAll(current.query)
            ).getRowObjectsJson();
            expect(normalize(after)).toEqual(normalize(before));
            if (scenario === 'all') {
                expect(
                    after.reduce(
                        (sum, row) =>
                            sum + Number(row.content_health_total_content),
                        0,
                    ),
                ).toBe(7);
            }
        }
    });

    it('runs both built-in queries without any event or user tables', async () => {
        for (const table of [
            'content_views',
            'query_events',
            'data_app_events',
        ])
            await db.run(`DROP TABLE ${table}`);
        expect(charts).toHaveLength(2);
        for (const chart of charts) {
            const { query } = compile({
                ...chart.metricQuery,
                filters: chart.metricQuery.filters as Filters,
            });
            expect(query).toContain('"lightdash_content"');
            expect(query).not.toMatch(
                /content_views|query_events|data_app_events|lightdash_users/,
            );
            expect(
                (await db.runAndReadAll(query)).getRowObjectsJson().length,
            ).toBeGreaterThan(0);
        }
    });

    it('uses selected inventory fields in the existing ownership donut', () => {
        const ownership = charts.find(({ slug }) =>
            slug.endsWith('-content-ownership-current-snapshot'),
        )!;
        expect(ownership.chartConfig.type).toBe(ChartType.PIE);
        if (ownership.chartConfig.type === ChartType.PIE) {
            expect(ownership.chartConfig.config).toMatchObject({
                groupFieldIds: ['content_health_owner_status'],
                metricId: 'content_health_total_content',
                isDonut: true,
            });
        }
    });
});
