/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance } from '@duckdb/node-api';
import {
    AI_BILLABLE_FEATURES,
    ChartType,
    DashboardTileTypes,
    FilterOperator,
    getTemplatedUrlRowDependencies,
    renderTemplatedUrl,
    TableCalculationType,
    UnitOfTime,
    WarehouseTypes,
    type ChartAsCode,
    type Filters,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { getDashboardTabSlug } from '../../services/CoderService/scheduledContent';
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
        compiledMetricQuery: compileMetricQuery({
            explore: explores.find(({ name }) => name === chart.tableName)!,
            metricQuery: {
                ...chart.metricQuery,
                filters: chart.metricQuery.filters as Filters,
            },
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                WarehouseTypes.DUCKDB,
            ),
            availableParameters: [],
        }),
        warehouseSqlBuilder: warehouseSqlBuilderFromType(WarehouseTypes.DUCKDB),
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery();

describe('built-in usage dashboards', () => {
    it('makes every built-in table content action usable with hidden selected URL values', () => {
        const linked = charts.filter(
            (chart) =>
                chart.chartConfig.type === ChartType.TABLE &&
                chart.metricQuery.dimensions.some((field) =>
                    /_(chart|dashboard|content)_name$/.test(field),
                ),
        );
        expect(linked.map(({ slug }) => slug)).toHaveLength(9);
        expect(
            linked.some(({ slug }) =>
                slug.endsWith('-adoption-dashboard-audience'),
            ),
        ).toBe(true);
        for (const chart of linked) {
            if (chart.chartConfig.type !== ChartType.TABLE)
                throw new Error('Expected table');
            const table = explores.find(({ name }) => name === chart.tableName)!
                .tables[chart.tableName];
            for (const fieldId of chart.metricQuery.dimensions.filter((field) =>
                /_(chart|dashboard|content)_name$/.test(field),
            )) {
                const field = Object.values(table.dimensions).find(
                    ({ name }) => `${table.name}_${name}` === fieldId,
                )!;
                const [action] = field.urls!;
                const urlId = fieldId.replace(/_name$/, '_url');
                expect(getTemplatedUrlRowDependencies(action.url)).toEqual([
                    urlId,
                ]);
                expect(chart.metricQuery.dimensions).toContain(urlId);
                expect(
                    chart.chartConfig.config?.columns?.[urlId]?.visible,
                ).toBe(false);
                expect(chart.tableConfig?.columnOrder).toContain(urlId);
                const urlName = field.name.replace(/_name$/, '_url');
                const target =
                    'https://lightdash.example/projects/project/dashboards/dashboard';
                expect(
                    renderTemplatedUrl(
                        action.url,
                        {
                            raw: '<untrusted name>',
                            formatted: '<untrusted name>',
                        },
                        {
                            [table.name]: {
                                [urlName]: { raw: target, formatted: target },
                            },
                        },
                    ),
                ).toBe(target);
                expect(
                    renderTemplatedUrl(
                        action.url,
                        { raw: 'Legacy content', formatted: 'Legacy content' },
                        {
                            [table.name]: {
                                [urlName]: { raw: null, formatted: '-' },
                            },
                        },
                    ),
                ).toBe('');
            }
        }
        const scatter = charts.find(({ slug }) =>
            slug.endsWith(
                '-high-compute-dashboards-audience-versus-warehouse-time',
            ),
        )!;
        expect(scatter.metricQuery.dimensions).not.toContain(
            'content_health_content_url',
        );
    });

    const aiTokens = analyticsContentAsCode.find(
        ({ dashboard }) => dashboard.slug === 'lightdash-analytics-ai-tokens',
    )!;

    it('uses existing AI Usage fields and distinguishes billing scope from all usage', () => {
        expect(aiTokens.charts).toHaveLength(24);
        for (const chart of aiTokens.charts) {
            expect(chart.tableName).toBe('ai_usage');
            expect(chart.metricQuery.timezone).toBe('UTC');
            const group = (chart.metricQuery.filters as Filters).dimensions!;
            const rules = 'and' in group ? group.and : [];
            expect(rules).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        operator: FilterOperator.IN_THE_CURRENT,
                        settings: { unitOfTime: UnitOfTime.months },
                    }),
                    expect.objectContaining({
                        operator: FilterOperator.IN_THE_PAST,
                        values: [31],
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: true,
                        },
                    }),
                ]),
            );
            const billingScope =
                /-(eligible|details|(?:feature|channel|user|project|agent)-(?:daily|rank))$/.test(
                    chart.slug,
                );
            expect(rules).toHaveLength(billingScope ? 5 : 2);
            if (billingScope) {
                for (const [fieldId, values] of [
                    ['ai_usage_key_management', ['lightdash-managed']],
                    ['ai_usage_outcome', ['complete']],
                    ['ai_usage_feature', [...AI_BILLABLE_FEATURES]],
                ]) {
                    expect(rules).toContainEqual(
                        expect.objectContaining({
                            target: { fieldId },
                            operator: FilterOperator.EQUALS,
                            values,
                        }),
                    );
                }
            }
            if (/-(project-(?:daily|rank)|details)$/.test(chart.slug)) {
                expect(chart.metricQuery.dimensions).toEqual(
                    expect.arrayContaining([
                        'ai_usage_project_id',
                        'ai_usage_project_name',
                    ]),
                );
            }
        }
    });

    it('keeps AI token tabs stable on sync and leaves room for ranking labels', () => {
        const installed = {
            tabs: aiTokens.dashboard.tabs.map((tab) => ({
                name: tab.name,
                order: tab.order,
                uuid: tab.slug!,
            })),
        };
        expect(installed.tabs).toHaveLength(6);
        for (const tab of installed.tabs) {
            expect(getDashboardTabSlug(installed, tab.uuid)).toBe(tab.uuid);
        }
        for (const tile of aiTokens.dashboard.tiles.filter(
            (item) => item.type === DashboardTileTypes.SAVED_CHART,
        )) {
            expect(tile.properties.title).toBe('');
            if (tile.properties.chartSlug?.endsWith('-rank')) {
                expect(tile.h).toBeGreaterThanOrEqual(6);
            }
        }
    });

    it('uses display-only user labels without changing the selected identities', () => {
        const userCharts = charts.filter(
            (chart) =>
                chart.dashboardSlug !== 'lightdash-analytics-ai-tokens' &&
                chart.metricQuery.dimensions.includes(
                    `${chart.tableName}_user_name`,
                ),
        );
        expect(userCharts.length).toBeGreaterThan(0);
        for (const chart of userCharts) {
            const nameField = `${chart.tableName}_user_name`;
            const idField = `${chart.tableName}_user_id`;
            expect(chart.metricQuery.dimensions).toContain(idField);
            expect(chart.metricQuery.tableCalculations).toContainEqual(
                expect.objectContaining({
                    name: 'user_display_name',
                    type: TableCalculationType.STRING,
                }),
            );
            expect(chart.chartConfig.type).toBe(ChartType.TABLE);
            if (chart.chartConfig.type === ChartType.TABLE) {
                const columns = chart.chartConfig.config?.columns;
                expect(columns?.[nameField]?.visible).toBe(false);
                expect(columns?.[idField]?.visible).toBe(false);
                expect(
                    chart.metricQuery.tableCalculations.find(
                        ({ name }) => name === 'user_display_name',
                    )?.displayName,
                ).toBe(columns?.[nameField]?.name ?? 'User name');
            }
            const order = chart.tableConfig?.columnOrder ?? [];
            expect(order.indexOf('user_display_name')).toBe(
                order.indexOf(nameField) - 2,
            );
            expect(
                order.filter((field) => field === 'user_display_name'),
            ).toHaveLength(1);
        }
    });

    it('labels missing names and identities using existing summary rows while preserving totals and filters', async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            await db.run(
                `CREATE TABLE user_activity (${userActivityColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR)',
            );
            await db.run(`INSERT INTO lightdash_users VALUES
                ('org','named-a','Alex'), ('org','named-b','Alex'),
                ('org','unnamed-a',NULL), ('org','unnamed-b','  '),
                ('org','empty-name',''), ('other','missing-name','Other tenant')`);
            await db.run(`INSERT INTO user_activity (org_id,project_id,user_id,activity_date,event_count,stream) VALUES
                ('org','project','named-a','2026-01-05',2,'ai_usage'),
                ('org','project','named-b','2026-01-05',3,'query_events'),
                ('org','project','unnamed-a','2026-01-05',5,'ai_usage'),
                ('org','project','unnamed-b','2026-01-05',7,'query_events'),
                ('org','project','empty-name','2026-01-05',11,'content_views'),
                ('org','project','missing-name','2026-01-05',13,'mcp_tool_calls'),
                ('org','project',NULL,'2026-01-05',17,'ai_usage'),
                ('org','project',NULL,'2026-01-05',29,'query_events'),
                ('org','project','','2026-01-05',19,NULL),
                ('org','project','   ','2026-01-05',23,'data_app_events')`);
            const chart = charts.find(({ slug }) =>
                slug.endsWith('-observed-activity-by-person-and-week'),
            )!;
            const rows = (
                await db.runAndReadAll(compile(chart).query)
            ).getRowObjects();
            const before = (
                await db.runAndReadAll(
                    compile({
                        ...chart,
                        metricQuery: {
                            ...chart.metricQuery,
                            metrics: chart.metricQuery.metrics.filter(
                                (field) =>
                                    field !== 'user_activity_activity_origin',
                            ),
                            additionalMetrics: [],
                            tableCalculations: [],
                        },
                    }).query,
                )
            ).getRowObjects();
            expect(rows).toHaveLength(before.length);
            const labels = new Map<unknown, string>([
                ['named-a', 'Alex'],
                ['named-b', 'Alex'],
                ['unnamed-a', 'User unnamed-a'],
                ['unnamed-b', 'User unnamed-b'],
                ['empty-name', 'User empty-name'],
                ['missing-name', 'User missing-name'],
                [null, 'No user recorded'],
                ['', 'No user recorded'],
                ['   ', 'No user recorded'],
            ]);
            for (const {
                user_display_name: label,
                user_activity_activity_origin: origin,
                ...row
            } of rows) {
                expect(before).toContainEqual(row);
                expect(typeof origin).toBe('string');
                expect(label).toBe(labels.get(row.user_activity_user_id));
            }
            expect(
                rows.reduce(
                    (sum, row) => sum + Number(row.user_activity_total_events),
                    0,
                ),
            ).toBe(129);
            expect(
                rows.find(
                    ({ user_activity_user_id }) =>
                        user_activity_user_id === null,
                ),
            ).toMatchObject({
                user_activity_activity_origin: 'AI, Query',
                user_activity_total_events: 46n,
            });
            expect(
                rows.filter(
                    ({ user_display_name }) => user_display_name === 'Alex',
                ),
            ).toHaveLength(2);
            expect(
                JSON.stringify(rows, (_, value) =>
                    typeof value === 'bigint' ? String(value) : value,
                ),
            ).not.toContain('Other tenant');
            const filtered = (
                await db.runAndReadAll(
                    compile({
                        ...chart,
                        metricQuery: {
                            ...chart.metricQuery,
                            filters: {
                                dimensions: {
                                    id: 'missing-names',
                                    and: [
                                        {
                                            id: 'legacy-name-filter',
                                            target: {
                                                fieldId:
                                                    'user_activity_user_name',
                                            },
                                            operator: FilterOperator.EQUALS,
                                            values: ['Unknown user'],
                                        },
                                    ],
                                },
                            },
                        },
                    }).query,
                )
            ).getRowObjects();
            expect(
                filtered.map(
                    ({ user_activity_user_id }) => user_activity_user_id,
                ),
            ).toEqual(
                expect.arrayContaining(['missing-name', null, '', '   ']),
            );
            expect(
                filtered.some(
                    ({ user_display_name }) => user_display_name === 'Alex',
                ),
            ).toBe(false);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    it('shows captured embed origin without splitting a viewer row or inventing an identity', async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            await db.run(
                `CREATE TABLE data_app_events (${compactedStreamSchemas.data_app_events.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR)',
            );
            await db.run(`INSERT INTO data_app_events (org_id,project_id,user_id,app_id,event_name,view_context) VALUES
                ('org','project',NULL,'app','data_app.view','embed'),
                ('org','project',NULL,'app','data_app.view','embed'),
                ('org','project',NULL,'app','data_app.view','standalone')`);
            const chart = charts.find(
                ({ slug }) => slug === 'lightdash-analytics-apps-top-people',
            )!;
            const rows = (
                await db.runAndReadAll(compile(chart).query)
            ).getRowObjects();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                user_display_name: 'No user recorded',
                data_app_events_activity_origin: 'App, Embed',
                data_app_events_total_views: 3n,
            });
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    it('shares inactivity charts between People and Adoption without changing their fixed windows', () => {
        const inactivityCharts = analyticsContentAsCode
            .filter(({ dashboard }) =>
                [
                    'lightdash-analytics-people',
                    'lightdash-analytics-adoption',
                ].includes(dashboard.slug),
            )
            .map((bundle) => {
                const populationCharts = bundle.charts.filter(
                    ({ tableName }) => tableName === 'people_adoption',
                );
                expect(populationCharts).toHaveLength(3);
                const count = populationCharts.find(
                    ({ chartConfig }) =>
                        chartConfig.type === ChartType.BIG_NUMBER,
                )!;
                expect(count.metricQuery.dimensions).toEqual([]);
                expect(count.metricQuery.metrics).toEqual([
                    'people_adoption_people_without_observed_activity',
                ]);
                for (const chart of populationCharts.filter(
                    ({ chartConfig }) => chartConfig.type === ChartType.TABLE,
                )) {
                    expect(chart.metricQuery.dimensions).toContain(
                        'people_adoption_user_id',
                    );
                    expect(chart.metricQuery.dimensions).toContain(
                        'people_adoption_activity_through_day',
                    );
                    expect(chart.metricQuery.metrics).toEqual([]);
                    if (chart.chartConfig.type === ChartType.TABLE)
                        expect(
                            chart.chartConfig.config?.columns
                                ?.people_adoption_name?.visible,
                        ).toBe(false);
                    expect(chart.tableConfig?.columnOrder?.[0]).toBe('person');
                }
                return populationCharts.map(({ metricQuery }) => metricQuery);
            });
        expect(inactivityCharts[0]).toEqual(inactivityCharts[1]);
    });

    it('scopes outcome filters and the default date range to the two outcome charts', () => {
        const { dashboard, charts: adoptionCharts } =
            analyticsContentAsCode.find(
                ({ dashboard: item }) =>
                    item.slug === 'lightdash-analytics-adoption',
            )!;
        const outcomeCharts = adoptionCharts.filter(
            ({ tableName }) => tableName === 'data_app_outcomes',
        );
        expect(outcomeCharts).toHaveLength(2);
        expect(dashboard.filters?.dimensions?.[0]).toMatchObject({
            label: 'Date',
            operator: FilterOperator.IN_THE_PAST,
            values: [30],
        });
        for (const filter of dashboard.filters?.dimensions ?? []) {
            for (const chart of adoptionCharts) {
                expect(filter.tileTargets?.[chart.slug]).toEqual(
                    chart.tableName === 'data_app_outcomes'
                        ? filter.target
                        : false,
                );
            }
        }
        const outcomeTiles = dashboard.tiles.filter(
            (tile) =>
                tile.type === DashboardTileTypes.SAVED_CHART &&
                tile.tabSlug === 'app-outcomes',
        );
        expect(outcomeTiles).toHaveLength(2);
    });

    it.each(charts.map((chart) => [chart.slug, chart] as const))(
        'compiles %s without missing fields or join warnings',
        (_slug, chart) => {
            expect(compile(chart).warnings).toEqual([]);
            expect(chart.metricQuery.limit).toBeLessThanOrEqual(5000);
            expect(
                chart.metricQuery.dimensions.every((field) =>
                    field.startsWith(`${chart.tableName}_`),
                ),
            ).toBe(true);
        },
    );

    it('includes zero-event people and distinguishes them from lapsed people without merging names', async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '256MB',
            threads: '1',
        });
        const db = await instance.connect();
        try {
            const schemas = {
                lightdash_people: usageDimensionSchemas.people,
                ...Object.fromEntries(
                    [
                        'query_events',
                        'content_views',
                        'agent_request_events',
                        'data_app_events',
                        'mcp_tool_calls',
                    ].map((name) => [
                        name,
                        compactedStreamSchemas[
                            name as keyof typeof compactedStreamSchemas
                        ],
                    ]),
                ),
            };
            for (const [name, columns] of Object.entries(schemas)) {
                await db.run(
                    `CREATE TABLE "${name}" (${columns.map((column) => `"${column.name}" ${column.type}`).join(', ')})`,
                );
            }
            await db.run(`INSERT INTO lightdash_people (org_id,user_id,name,organization_role,snapshot_at,is_active,is_setup_complete,is_eligible) VALUES
                ('org','recent','Recent','member','2026-10-21 00:30:00',true,true,true),
                ('org','lapsed','Lapsed','member','2026-10-21 00:30:00',true,true,true),
                ('org','never-a','Alex','member','2026-10-21 00:30:00',true,true,true),
                ('org','never-b','Alex','member','2026-10-21 00:30:00',true,true,true),
                ('org','unnamed','   ','member','2026-10-21 00:30:00',true,true,true),
                ('org','scheduled','Scheduled only','member','2026-10-21 00:30:00',true,true,true),
                ('org','inactive','Inactive','member','2026-10-21 00:30:00',false,true,false),
                ('org','pending','Pending','member','2026-10-21 00:30:00',true,false,false)`);
            await db.run(`INSERT INTO content_views (org_id,user_id,event_ts,actor_type,is_qualifying) VALUES
                ('org','recent','2026-10-20 12:00:00','user',true),
                ('org','recent','2026-10-20 12:00:00','user',true),
                ('org','lapsed','2026-09-01 12:00:00','user',true)`);
            await db.run(`INSERT INTO query_events (org_id,user_id,event_ts,workload_origin,initiating_actor_type) VALUES
                ('org','scheduled','2026-10-20 12:00:00','scheduled','user')`);

            const populationCharts = charts.filter(
                ({ tableName, dashboardSlug }) =>
                    tableName === 'people_adoption' &&
                    dashboardSlug === 'lightdash-analytics-people',
            );
            const count = populationCharts.find(({ slug }) =>
                slug.endsWith('-people-without-observed-activity'),
            )!;
            const noObserved = populationCharts.find(({ slug }) =>
                slug.endsWith('-people-without-observed-activity-detail'),
            )!;
            const inactive30d = populationCharts.find(({ slug }) =>
                slug.endsWith('-people-without-activity-30d-detail'),
            )!;
            const query = async (chart: ChartAsCode) =>
                (
                    await db.runAndReadAll(compile(chart).query)
                ).getRowObjectsJS();
            expect(await query(count)).toEqual([
                { people_adoption_people_without_observed_activity: 4n },
            ]);
            const unobservedRows = await query(noObserved);
            expect(
                unobservedRows.map((row) => row.people_adoption_user_id).sort(),
            ).toEqual(['never-a', 'never-b', 'scheduled', 'unnamed']);
            expect(
                unobservedRows.filter((row) => row.person === 'Alex'),
            ).toHaveLength(2);
            expect(unobservedRows).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        people_adoption_user_id: 'unnamed',
                        person: 'User unnamed',
                    }),
                ]),
            );
            const inactiveRows = await query(inactive30d);
            expect(
                inactiveRows.map((row) => row.people_adoption_user_id).sort(),
            ).toEqual(['lapsed', 'never-a', 'never-b', 'scheduled', 'unnamed']);
            expect(inactiveRows).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        people_adoption_user_id: 'lapsed',
                        people_adoption_activity_status:
                            'Previously observed; inactive for 30 days',
                        people_adoption_days_since_last_activity: 49n,
                    }),
                    expect.objectContaining({
                        people_adoption_user_id: 'never-a',
                        people_adoption_activity_status:
                            'No qualifying activity observed',
                        people_adoption_last_observed_activity_at: null,
                    }),
                ]),
            );
            expect(
                new Set(
                    inactiveRows.map((row) =>
                        String(row.people_adoption_activity_through_day),
                    ),
                ).size,
            ).toBe(1);

            await db.run(`INSERT INTO content_views (org_id,user_id,event_ts,actor_type,is_qualifying)
                SELECT org_id,user_id,TIMESTAMP '2026-10-20 12:00:00','user',true
                FROM lightdash_people WHERE is_eligible`);
            expect(await query(count)).toEqual([
                { people_adoption_people_without_observed_activity: 0n },
            ]);
            expect(await query(noObserved)).toEqual([]);
            expect(await query(inactive30d)).toEqual([]);
            await db.run('DELETE FROM lightdash_people');
            expect(await query(count)).toEqual([
                { people_adoption_people_without_observed_activity: 0n },
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    it('reconciles Adoption prompts, audience and creator filters against synthetic activity', async () => {
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
            await db.run(
                `INSERT INTO lightdash_users VALUES ('org','a','Alex'),('org','b','Alex'),('other','a','Wrong tenant')`,
            );
            await db.run(`INSERT INTO user_activity (org_id, project_id, user_id, activity_date, event_count) VALUES
                ('org','project','a','2026-01-05',2),('org','project','a','2026-01-06',3),('org','project','b','2026-01-05',1),('org','project',NULL,'2026-01-05',4)`);
            await db.run(`INSERT INTO agent_request_events (org_id,project_id,event_id,prompt_id,stage,user_id,event_ts,surface,agent_id) VALUES
                ('org','project','one','one','created','a','2026-01-05','web_app','agent'),
                ('org','project','two','two','created','a','2026-01-05','web_app','agent'),
                ('org','project','three','three','created','b','2026-01-05','web_app','agent'),
                ('org','project','four','four','created',NULL,'2026-01-05','web_app','agent'),
                ('org','project','slack','slack','created','a','2026-01-05','slack','agent'),
                ('org','project','embed','embed','created','a','2026-01-05','embed','agent'),
                ('org','project','completed','one','outcome','a','2026-01-05',NULL,'agent')`);
            await db.run(
                "INSERT INTO agent_request_events SELECT * FROM agent_request_events WHERE event_id='one'",
            );
            await db.run(`INSERT INTO lightdash_content (org_id,project_id,content_type,content_id,content_name,is_deleted,snapshot_at) VALUES
                ('org','project','data_app','app','Sales',false,CURRENT_TIMESTAMP),
                ('org','project','data_app','zero','No reads',false,CURRENT_TIMESTAMP)`);
            await db.run(`INSERT INTO data_app_events (org_id,project_id,app_id,user_id,event_ts,event_name,view_context) VALUES
                ('org','project','app','a','2026-01-05','data_app.created',NULL),
                ('org','project','app','b','2026-01-05','data_app.view','standalone'),
                ('org','project','app','b','2026-01-05','data_app.view','standalone'),
                ('org','project','app','a','2026-01-05','data_app.view','dashboard'),
                ('org','project','app','a','2026-01-05','data_app.view','builder'),
                ('org','project','app','b','2026-01-05','data_app.view','chart'),
                ('org','project','app','issuer','2026-01-05','data_app.view','embed'),
                ('org','project','app','a','2026-01-05','data_app.view','delivery'),
                ('org','project','app','historic','2026-01-05','data_app.view',NULL)`);
            await db.run(`INSERT INTO data_app_events (org_id,project_id,app_id,event_ts,event_name,view_context,version,navigation_id,outcome) VALUES
                ('org','project','app','2026-01-05','data_app.view_outcome','standalone',1,'a','html_loaded'),
                ('org','project','app','2026-01-05','data_app.view_outcome','standalone',1,'a','html_loaded'),
                ('org','project','app','2026-01-05','data_app.view_outcome','standalone',1,'a','sdk_started'),
                ('org','project','app','2026-01-05','data_app.view_outcome','standalone',1,'a','runtime_error'),
                ('org','project','app','2026-01-05','data_app.view_outcome','builder',1,'b','html_loaded'),
                ('org','project','app','2026-01-05','data_app.view_outcome','builder',1,'b','sdk_started'),
                ('org','project','app','2026-01-05','data_app.view_outcome','embed',1,'c','html_error'),
                ('org','project','app','2026-01-05','data_app.view_outcome',NULL,1,NULL,'runtime_error')`);
            const rows = new Map<string, Record<string, unknown>[]>();
            for (const chart of charts.filter(
                (c) => c.dashboardSlug === 'lightdash-analytics-adoption',
            )) {
                rows.set(
                    chart.slug.replace(
                        'lightdash-analytics-adoption-adoption-',
                        '',
                    ),
                    (
                        await db.runAndReadAll(compile(chart).query)
                    ).getRowObjectsJS(),
                );
            }
            expect(
                rows
                    .get('active-people-day')
                    ?.map((row) => Number(row.user_activity_unique_users)),
            ).toEqual([2, 1]);
            expect(
                rows
                    .get('active-people-week')
                    ?.map((row) => Number(row.user_activity_unique_users)),
            ).toEqual([2]);
            expect(rows.get('people-history')).toHaveLength(3);
            expect(rows.get('app-outcome-trend')).toEqual([
                expect.objectContaining({
                    data_app_outcomes_html_error: 1n,
                    data_app_outcomes_runtime_error: 1n,
                }),
            ]);
            expect(rows.get('app-outcome-detail')).toHaveLength(4);
            expect(rows.get('app-outcome-detail')).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        data_app_outcomes_app_name: 'Sales',
                        data_app_outcomes_view_context: 'standalone',
                        data_app_outcomes_html_loaded: 1n,
                        data_app_outcomes_sdk_started: 1n,
                        data_app_outcomes_runtime_error: 1n,
                        data_app_outcomes_total_signals: 4n,
                    }),
                    expect.objectContaining({
                        data_app_outcomes_view_context: 'builder',
                        data_app_outcomes_html_loaded: 1n,
                        data_app_outcomes_sdk_started: 1n,
                    }),
                    expect.objectContaining({
                        data_app_outcomes_view_context: 'embed',
                        data_app_outcomes_html_error: 1n,
                    }),
                    expect.objectContaining({
                        data_app_outcomes_view_context: 'unknown',
                        data_app_outcomes_runtime_error: 0n,
                        data_app_outcomes_total_signals: 1n,
                    }),
                ]),
            );
            expect(rows.get('ask-ai-questions')).toEqual([
                expect.objectContaining({ agent_requests_total_requests: 4n }),
            ]);
            expect(rows.get('ask-ai-people')).toEqual([
                expect.objectContaining({
                    agent_requests_distinct_requesters: 2n,
                }),
            ]);
            expect(rows.get('ask-ai-frequency')).toEqual([
                expect.objectContaining({ questions_per_person: 1.5 }),
            ]);
            expect(rows.get('ask-ai-users')).toHaveLength(3);
            expect(rows.get('app-creators')).toEqual([
                expect.objectContaining({
                    data_app_events_user_name: 'Alex',
                    data_app_events_user_id: 'a',
                    data_app_events_unique_apps: 1n,
                }),
            ]);
            expect(rows.get('app-reader-detail')).toEqual([
                expect.objectContaining({
                    data_app_reach_user_name: 'Alex',
                    data_app_reach_user_id: 'b',
                    data_app_reach_total_loads: 3n,
                }),
                expect.objectContaining({
                    data_app_reach_user_name: 'Alex',
                    data_app_reach_user_id: 'a',
                    data_app_reach_total_loads: 1n,
                }),
            ]);
            for (const key of ['app-audience', 'app-reader-trend']) {
                expect(rows.get(key)).toEqual([
                    expect.objectContaining({
                        data_app_reach_total_loads: 4n,
                        data_app_reach_distinct_viewers: 2n,
                    }),
                ]);
            }
            const surfaces = rows.get('app-first-audience')!;
            expect(
                surfaces.reduce(
                    (total, row) =>
                        total + Number(row.data_app_reach_total_loads),
                    0,
                ),
            ).toBe(8);
            expect(surfaces).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        data_app_reach_view_context: 'embed',
                        data_app_reach_total_loads: 1n,
                        data_app_reach_distinct_viewers: 0n,
                    }),
                    expect.objectContaining({
                        data_app_reach_view_context: 'unknown',
                        data_app_reach_total_loads: 1n,
                        data_app_reach_distinct_viewers: 1n,
                    }),
                    expect.objectContaining({
                        data_app_reach_view_context: 'builder',
                        data_app_reach_total_loads: 1n,
                    }),
                ]),
            );
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

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
            const references = [
                {
                    fieldId: 'orders_revenue',
                    fieldLabel: 'Revenue',
                    fieldName: 'revenue',
                    tableName: 'orders',
                    fieldKind: 'metric',
                    fieldOrigin: 'model',
                    role: 'selected',
                },
                {
                    fieldId: 'orders_revenue',
                    fieldLabel: 'Revenue',
                    fieldName: 'revenue',
                    tableName: 'orders',
                    fieldKind: 'metric',
                    fieldOrigin: 'model',
                    role: 'sort',
                },
                {
                    fieldId: 'orders_status',
                    fieldLabel: 'Status',
                    fieldName: 'status',
                    tableName: 'orders',
                    fieldKind: 'dimension',
                    fieldOrigin: 'model',
                    role: 'selected',
                },
                {
                    fieldId: 'orders_status',
                    fieldLabel: 'Status',
                    fieldName: 'status',
                    tableName: 'orders',
                    fieldKind: 'dimension',
                    fieldOrigin: 'model',
                    role: 'group',
                },
            ];
            await db.run(`INSERT INTO query_events (org_id, project_id, query_id, user_id, event_ts, chart_id, dashboard_id, app_id, context, semantic_lineage_status, semantic_field_references) VALUES
                ('org-a','project-a','q1','person-a',CURRENT_TIMESTAMP,'semantic-chart','semantic-dashboard','semantic-app','dashboard','captured','${JSON.stringify(references)}'),
                ('org-a','project-a','q2',NULL,CURRENT_TIMESTAMP,NULL,NULL,NULL,'api',NULL,NULL),
                ('org-a','project-a','q3',NULL,CURRENT_TIMESTAMP,NULL,NULL,NULL,'exploreView','partial','${JSON.stringify([references[2]])}'),
                ('org-a','project-a','q4','person-a',CURRENT_TIMESTAMP,NULL,NULL,NULL,'sqlRunner','unavailable','[]')`);
            await db.run(
                "INSERT INTO query_events SELECT * FROM query_events WHERE query_id = 'q1'",
            );
            await db.run(`INSERT INTO lightdash_users (org_id,user_id,name) VALUES
                ('org-a','person-a','Alex'),('org-b','person-a','Other organization')`);
            await db.run(`INSERT INTO lightdash_charts (org_id,chart_id,name) VALUES
                ('org-a','semantic-chart','Revenue chart'),('org-b','semantic-chart','Other organization')`);
            await db.run(`INSERT INTO lightdash_dashboards (org_id,dashboard_id,name) VALUES
                ('org-a','semantic-dashboard','Sales'),('org-b','semantic-dashboard','Other organization')`);
            await db.run(`INSERT INTO lightdash_content (org_id,project_id,content_type,content_id,content_name) VALUES
                ('org-a','project-a','data_app','semantic-app','Sales app'),
                ('org-b','project-a','data_app','semantic-app','Other organization')`);
            const semanticRows = new Map<string, Record<string, unknown>[]>();
            for (const chart of charts.filter(
                ({ tableName }) => tableName === 'semantic_usage',
            )) {
                const rows = (
                    await db.runAndReadAll(compile(chart).query)
                ).getRowObjects();
                semanticRows.set(chart.slug, rows);
                expect(
                    JSON.stringify(rows, (_, value) =>
                        typeof value === 'bigint' ? value.toString() : value,
                    ),
                ).not.toContain('Other organization');
            }
            const prefix = 'lightdash-analytics-query-activity-';
            expect(semanticRows.get(`${prefix}most-used-fields`)).toEqual([
                expect.objectContaining({
                    semantic_usage_field_label: 'Status',
                    semantic_usage_total_queries: 2n,
                }),
                expect.objectContaining({
                    semantic_usage_field_label: 'Revenue',
                    semantic_usage_total_queries: 1n,
                }),
            ]);
            expect(
                semanticRows.get(`${prefix}people-using-fields`),
            ).toHaveLength(3);
            expect(semanticRows.get(`${prefix}people-using-fields`)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        semantic_usage_user_name: 'Unknown user',
                        semantic_usage_user_id: null,
                        semantic_usage_total_queries: 1n,
                    }),
                ]),
            );
            expect(semanticRows.get(`${prefix}content-using-fields`)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        semantic_usage_chart_name: 'Revenue chart',
                        semantic_usage_dashboard_name: 'Sales',
                        semantic_usage_app_name: 'Sales app',
                        semantic_usage_total_queries: 1n,
                    }),
                ]),
            );
            expect(
                semanticRows.get(`${prefix}field-capture-coverage`),
            ).toHaveLength(4);
            expect(
                semanticRows
                    .get(`${prefix}field-capture-coverage`)
                    ?.every((row) => row.semantic_usage_total_queries === 1n),
            ).toBe(true);
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
                rows.filter(
                    (row) => row.data_app_events_app_name === 'Shared name',
                ),
            ).toHaveLength(2);
            expect(rows.map((row) => row.data_app_events_app_name)).toEqual(
                expect.arrayContaining([
                    'historical-app',
                    'Unknown app',
                    'Other project',
                ]),
            );
            expect(
                rows.map((row) => row.data_app_events_app_name),
            ).not.toContain('Other organization');
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
