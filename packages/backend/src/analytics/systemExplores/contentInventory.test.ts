/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
    ChartType,
    FilterOperator,
    getDashboardFilterRulesForTables,
    getFields,
    getItemId,
    ProjectType,
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
import { contentCreatedByDaySql, customerContentSql } from './contentInventory';
import {
    analyticsContentAsCode,
    analyticsLibraryChartBindings,
} from './sampleContent';

const charts = analyticsContentAsCode
    .flatMap((bundle) => bundle.charts)
    .filter(({ slug }) => /-content-ownership-current-snapshot$/.test(slug));

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
            { owner_status: null, owner_id: null, project_type: null },
            {
                project_id: 'other-project',
                project_type: ProjectType.PREVIEW,
                content_type: 'sql_chart',
            },
            { content_type: 'data_app', created_at: '2026-02-01' },
            { content_id: null, owner_status: 'Unassigned' },
        ];
        for (const row of rows) {
            const fixture: Record<string, unknown> = {
                org_id: 'org',
                project_id: 'project',
                project_type: ProjectType.DEFAULT,
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

    it('can exclude preview projects from historical counts without dropping legacy rows', async () => {
        const { query } = compile({
            exploreName: 'content_inventory',
            dimensions: ['content_health_project_type'],
            metrics: ['content_health_total_content'],
            filters: {
                dimensions: {
                    id: 'historical-content',
                    and: [
                        {
                            id: 'date',
                            target: {
                                fieldId: 'content_health_created_at_day',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['2026-01-01'],
                        },
                        {
                            id: 'project-type',
                            target: { fieldId: 'content_health_project_type' },
                            operator: FilterOperator.NOT_EQUALS,
                            values: [ProjectType.PREVIEW],
                        },
                    ],
                },
            },
            sorts: [],
            limit: 10,
            tableCalculations: [],
        });
        const rows = (await db.runAndReadAll(query)).getRowObjectsJson();
        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    content_health_project_type: ProjectType.DEFAULT,
                }),
                expect.objectContaining({ content_health_project_type: null }),
            ]),
        );
        expect(rows).toHaveLength(2);
    });

    it('preserves legacy field IDs and existing chart filters', async () => {
        const chart = charts.find(({ slug }) =>
            slug.endsWith('-content-ownership-current-snapshot'),
        )!;
        expect(chart.metricQuery.dimensions).toEqual([
            'content_health_owner_status_name',
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
        const legacyDimension = creation
            ? 'created_at_month'
            : 'owner_status_name';
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

    it("leaves Lightdash's own analytics content out of every count and list of content", async () => {
        const count = async (table: string) =>
            Number(
                (
                    await db.runAndReadAll(
                        `SELECT COUNT(content_id) AS items FROM ${table}`,
                    )
                ).getRowObjectsJS()[0].items,
            );
        const { contentHealthSql } = await import('./contentHealth');
        const before = {
            inventory: await count(customerContentSql),
            created: await count(contentCreatedByDaySql),
            health: await count(contentHealthSql),
        };
        await db.run(
            `INSERT INTO lightdash_content (org_id, project_id, project_type, content_type, content_id, content_name, created_at, is_deleted)
             VALUES ('org', 'analytics-project', 'ANALYTICS', 'dashboard', 'managed', 'Queries', '2026-03-01', false),
                    ('org', 'analytics-project', 'ANALYTICS', 'saved_chart', 'managed-chart', 'Active people', '2026-03-01', false)`,
        );
        expect({
            inventory: await count(customerContentSql),
            created: await count(contentCreatedByDaySql),
            health: await count(contentHealthSql),
        }).toEqual(before);
        expect(before.inventory).toBeGreaterThan(0);
    });

    it('runs the built-in query without any event or user tables', async () => {
        for (const table of [
            'content_views',
            'query_events',
            'data_app_events',
        ])
            await db.run(`DROP TABLE ${table}`);
        expect(charts).toHaveLength(1);
        for (const chart of charts) {
            const { query } = compile({
                ...chart.metricQuery,
                filters: chart.metricQuery.filters as Filters,
            });
            expect(query).toContain(
                "FROM lightdash_content WHERE (project_type IS NULL OR project_type <> 'ANALYTICS')",
            );
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
                groupFieldIds: ['content_health_owner_status_name'],
                metricId: 'content_health_total_content',
                isDonut: true,
            });
        }
    });
    it('gives the Content created card a point for every day, with the same total as the plain number', async () => {
        const card = analyticsContentAsCode
            .flatMap((bundle) => bundle.charts)
            .find(
                ({ slug }) =>
                    slug === 'lightdash-analytics-home-content-created',
            )!;
        const binding = analyticsLibraryChartBindings.get(card.slug)!;
        const run = async (metricQuery: MetricQuery) =>
            (
                await db.runAndReadAll(compile(metricQuery).query)
            ).getRowObjectsJS();
        const plainQuery = {
            ...card.metricQuery,
            filters: card.metricQuery.filters as Filters,
        } as MetricQuery;
        const [plain] = await run(plainQuery);
        const byDay = await run({
            ...plainQuery,
            dimensions: binding.query!.dimensions,
            sorts: binding.query!.sorts,
            limit: binding.query!.limit,
        });
        const total = Number(plain.content_health_total_content);
        expect(total).toBeGreaterThan(0);
        expect(
            byDay.reduce(
                (sum, row) => sum + Number(row.content_health_total_content),
                0,
            ),
        ).toBe(total);
        // One row for each day since the first item was created, most of them zero
        // (an item with no creation date has no day; the Date filter leaves it out)
        const days = byDay
            .filter((row) => row.content_health_created_at_day !== null)
            .map((row) =>
                new Date(row.content_health_created_at_day as Date).getTime(),
            );
        expect(days.length).toBeGreaterThan(30);
        expect(
            days.slice(1).every((day, index) => day - days[index] === 86400000),
        ).toBe(true);
        expect(
            byDay.filter(
                (row) => Number(row.content_health_total_content) === 0,
            ).length,
        ).toBeGreaterThan(days.length - 5);
        // Every other inventory chart still reads the inventory as it is
        expect(
            analyticsContentAsCode
                .flatMap((bundle) => bundle.charts)
                .filter(({ tableName }) => tableName === 'content_created')
                .map(({ slug }) => slug),
        ).toEqual([
            // Each needs a row for every day: the two running totals by week, and this card
            'lightdash-analytics-content-content-creation-by-month',
            'lightdash-analytics-adoption-adoption-apps-created-by-day',
            card.slug,
        ]);
    });

    it('adds data apps up week by week from the first content to today, leaving out chart types', async () => {
        await db.run(
            `INSERT INTO lightdash_content (org_id, project_id, project_type, content_type, content_id, created_at, is_deleted)
             VALUES ('org', 'project', '${ProjectType.DEFAULT}', 'chart_type', 'heatmap', '2026-03-01', false)`,
        );
        const chart = analyticsContentAsCode
            .flatMap((bundle) => bundle.charts)
            .find(({ slug }) =>
                slug.endsWith('-adoption-apps-created-by-day'),
            )!;
        const rows = (
            await db.runAndReadAll(
                compile({
                    ...chart.metricQuery,
                    filters: chart.metricQuery.filters as Filters,
                } as MetricQuery).query,
            )
        ).getRowObjectsJS();
        const totals = rows.map((row) => Number(row.data_apps_running_total));
        // Nothing before the one data app of 1 February, one from then to this week
        expect(totals[0]).toBe(0);
        expect(totals.at(-1)).toBe(1);
        expect(new Set(totals)).toEqual(new Set([0, 1]));
        const weeks = rows.map((row) =>
            new Date(row.content_health_created_at_week as Date).getTime(),
        );
        expect(Date.now() - weeks.at(-1)!).toBeLessThan(8 * 86400000);
        expect(
            weeks
                .slice(1)
                .every((week, index) => week - weeks[index] === 7 * 86400000),
        ).toBe(true);
    });

    it('adds content up week by week into a running total, in total and by type', async () => {
        const chart = analyticsContentAsCode
            .flatMap((bundle) => bundle.charts)
            .find(({ slug }) => slug.endsWith('-content-creation-by-month'))!;
        const binding = analyticsLibraryChartBindings.get(chart.slug)!;
        const run = async (metricQuery: MetricQuery) =>
            (
                await db.runAndReadAll(compile(metricQuery).query)
            ).getRowObjectsJS();
        const plainQuery = {
            ...chart.metricQuery,
            filters: chart.metricQuery.filters as Filters,
        } as MetricQuery;
        const [{ dated }] = (
            await db.runAndReadAll(
                'SELECT COUNT(content_id) AS dated FROM lightdash_content WHERE created_at IS NOT NULL',
            )
        ).getRowObjectsJS();
        const total = await run(plainQuery);
        // A point for every week since the first item, never falling, ending on everything dated
        const totals = total.map((row) => Number(row.content_running_total));
        expect(totals.length).toBeGreaterThan(8);
        expect(
            totals.every(
                (value, index) => index === 0 || value >= totals[index - 1],
            ),
        ).toBe(true);
        expect(totals.at(-1)).toBe(Number(dated));
        const weeks = total.map((row) =>
            new Date(row.content_health_created_at_week as Date).getTime(),
        );
        expect(
            weeks
                .slice(1)
                .every((week, index) => week - weeks[index] === 7 * 86400000),
        ).toBe(true);
        // By type, each type has every week and the types add up to the same total
        const byType = await run({
            ...plainQuery,
            dimensions: binding.query!.dimensions,
            sorts: binding.query!.sorts,
            limit: binding.query!.limit,
            tableCalculations: binding.query!.tableCalculations!,
        });
        const latest = new Map<unknown, number>();
        byType.forEach((row) =>
            latest.set(
                row.content_health_content_type_name,
                Number(row.content_running_total),
            ),
        );
        expect(
            [...latest.values()].reduce((sum, value) => sum + value, 0),
        ).toBe(Number(dated));
        expect(byType.length).toBe(weeks.length * latest.size);
    });
});
