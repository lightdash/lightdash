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
import { analyticsColorPalette } from './analyticsColorPalette';
import { noteLines } from './noteLayout';
import {
    analyticsContentAsCode,
    analyticsLibraryChartBindings,
} from './sampleContent';
import { usageDashboardSpecs } from './usageDashboardDefinitions';

const charts = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
const explores = createAnalyticsExplores();
const chartBaseTable = (chart: ChartAsCode) =>
    explores.find(({ name }) => name === chart.tableName)!.baseTable;
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
                .tables[chartBaseTable(chart)];
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
        expect(installed.tabs).toHaveLength(7);
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

    it('uses primary email in AI token details without relabeling embedded viewers as accounts', async () => {
        const details = aiTokens.charts.find(({ slug }) =>
            slug.endsWith('-details'),
        )!;
        expect(details.tableConfig?.columnOrder?.[0]).toBe('user_display_name');
        if (details.chartConfig.type !== ChartType.TABLE)
            throw new Error('Expected table');
        expect(details.chartConfig.config?.columns).toMatchObject({
            ai_usage_user_name: { visible: false },
            ai_usage_user_email: { visible: false },
        });
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            const schemas = {
                ai_usage: compactedStreamSchemas.ai_usage,
                lightdash_users: usageDimensionSchemas.users,
                lightdash_projects: usageDimensionSchemas.projects,
                lightdash_agents: usageDimensionSchemas.agents,
            };
            for (const [name, columns] of Object.entries(schemas)) {
                await db.run(
                    `CREATE TABLE "${name}" (${columns.map((column) => `"${column.name}" ${column.type}`).join(', ')})`,
                );
            }
            await db.run(`INSERT INTO lightdash_users (org_id,user_id,name,email) VALUES
                ('org','named','Alex','named@example.com'),
                ('org','unnamed','  ',' primary@example.com '),
                ('org','no-email',NULL,NULL),
                ('other','unmatched',NULL,'other@example.com')`);
            await db.run(`INSERT INTO ai_usage (org_id,user_id,channel,total_tokens) VALUES
                ('org','named','web',1), ('org','unnamed','web',2),
                ('org','no-email','web',3), ('org','unmatched','web',4),
                ('org','named','embed',5), ('org',NULL,'web',6)`);
            const rows = (
                await db.runAndReadAll(
                    compile({
                        ...details,
                        metricQuery: { ...details.metricQuery, filters: {} },
                    }).query,
                )
            ).getRowObjects();
            expect(rows).toHaveLength(6);
            expect(rows).toEqual(
                expect.arrayContaining(
                    [
                        ['named', 'web', 'Alex'],
                        ['unnamed', 'web', 'primary@example.com'],
                        ['no-email', 'web', 'User no-email'],
                        ['unmatched', 'web', 'User unmatched'],
                        ['named', 'embed', 'Embedded viewers'],
                        [null, 'web', 'No user recorded'],
                    ].map(([id, channel, label]) =>
                        expect.objectContaining({
                            ai_usage_user_id: id,
                            ai_usage_channel: channel,
                            user_display_name: label,
                        }),
                    ),
                ),
            );
            expect(
                rows.reduce(
                    (sum, row) => sum + Number(row.ai_usage_total_tokens_used),
                    0,
                ),
            ).toBe(21);
            expect(
                rows.some(
                    (row) => row.ai_usage_user_email === 'other@example.com',
                ),
            ).toBe(false);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    it('uses display-only user labels without changing the selected identities', () => {
        const userCharts = charts.filter(
            (chart) =>
                chart.dashboardSlug !== 'lightdash-analytics-ai-tokens' &&
                chart.metricQuery.dimensions.includes(
                    `${chartBaseTable(chart)}_user_name`,
                ),
        );
        expect(userCharts.length).toBeGreaterThan(0);
        for (const chart of userCharts) {
            const nameField = `${chartBaseTable(chart)}_user_name`;
            const emailField = `${chartBaseTable(chart)}_user_email`;
            const idField = `${chartBaseTable(chart)}_user_id`;
            expect(chart.metricQuery.dimensions).toContain(idField);
            expect(chart.metricQuery.dimensions).toContain(emailField);
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
                expect(columns?.[emailField]?.visible).toBe(false);
                expect(
                    chart.metricQuery.tableCalculations.find(
                        ({ name }) => name === 'user_display_name',
                    )?.displayName,
                ).toBe(columns?.[nameField]?.name ?? 'User name');
            }
            const order = chart.tableConfig?.columnOrder ?? [];
            expect(order).toContain(emailField);
            expect(order.indexOf('user_display_name')).toBe(
                order.indexOf(nameField) - 2,
            );
            expect(
                order.filter((field) => field === 'user_display_name'),
            ).toHaveLength(1);
        }
    });

    it('falls back to primary email for missing names while preserving identities, totals and filters', async () => {
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
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR)',
            );
            await db.run(`INSERT INTO lightdash_users VALUES
                ('org','named-a','Alex','shared@example.com'), ('org','named-b','Alex','shared@example.com'),
                ('org','unnamed-a',NULL,'unnamed@example.com'), ('org','unnamed-b','  ','  '),
                ('org','empty-name','',' trimmed@example.com '), ('other','missing-name','Other tenant','other@example.com')`);
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
                slug.endsWith('-home-most-active-people'),
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
                            dimensions: chart.metricQuery.dimensions.filter(
                                (field) => field !== 'user_activity_user_email',
                            ),
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
                ['unnamed-a', 'unnamed@example.com'],
                ['unnamed-b', 'User unnamed-b'],
                ['empty-name', 'trimmed@example.com'],
                ['missing-name', 'User missing-name'],
                [null, 'No user recorded'],
                ['', 'No user recorded'],
                ['   ', 'No user recorded'],
            ]);
            for (const {
                user_display_name: label,
                user_activity_activity_origin: origin,
                user_activity_user_email: email,
                ...row
            } of rows) {
                expect(before).toContainEqual(row);
                expect(typeof origin).toBe('string');
                expect(label).toBe(labels.get(row.user_activity_user_id));
                expect(email).not.toBe('other@example.com');
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
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR)',
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

    it('keeps the inactivity charts on Adoption only, with their fixed windows', () => {
        // The People dashboard that repeated them is retired
        expect(
            analyticsContentAsCode.map(({ dashboard }) => dashboard.slug),
        ).not.toContain('lightdash-analytics-people');
        const inactivityCharts = analyticsContentAsCode
            .filter(
                ({ dashboard }) =>
                    dashboard.slug === 'lightdash-analytics-adoption',
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
                        'people_adoption_email',
                    );
                    expect(chart.metricQuery.dimensions).toContain(
                        'people_adoption_activity_through_day',
                    );
                    expect(chart.metricQuery.metrics).toEqual([]);
                    if (chart.chartConfig.type === ChartType.TABLE) {
                        expect(
                            chart.chartConfig.config?.columns
                                ?.people_adoption_name?.visible,
                        ).toBe(false);
                        expect(
                            chart.chartConfig.config?.columns
                                ?.people_adoption_email?.visible,
                        ).toBe(false);
                    }
                    expect(chart.tableConfig?.columnOrder?.[0]).toBe('person');
                }
                return populationCharts.map(({ metricQuery }) => metricQuery);
            });
        expect(inactivityCharts).toHaveLength(1);
    });

    it('lists the Agent adoption charts in order with their fallback types', () => {
        const { dashboard, charts: overviewCharts } =
            analyticsContentAsCode.find(
                ({ dashboard: item }) =>
                    item.slug === 'lightdash-analytics-overview',
            )!;
        const prefix = 'lightdash-analytics-overview-';
        const slugs = dashboard.tiles
            .filter(
                (tile) =>
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.tabSlug === 'adoption',
            )
            .map(
                (tile) => (tile.properties as { chartSlug: string }).chartSlug,
            );
        expect(slugs).toEqual(
            [
                'agent-requests-trend',
                'agent-requesters-trend',
                'agent-requests-by-agent-and-day',
                'agent-daily-requests-per-agent',
                'agent-adoption-by-week',
            ].map((key) => `${prefix}${key}`),
        );
        const fallbackType = (key: string) =>
            overviewCharts.find(({ slug }) => slug === `${prefix}${key}`)!
                .chartConfig.type;
        expect(fallbackType('agent-requests-trend')).toBe(ChartType.BIG_NUMBER);
        expect(fallbackType('agent-requesters-trend')).toBe(
            ChartType.BIG_NUMBER,
        );
        expect(fallbackType('agent-requests-by-agent-and-day')).toBe(
            ChartType.TABLE,
        );
        expect(fallbackType('agent-daily-requests-per-agent')).toBe(
            ChartType.TABLE,
        );
        expect(fallbackType('agent-adoption-by-week')).toBe(ChartType.TABLE);
    });

    it('lays the Agent adoption sections out as explicit rows', () => {
        const { dashboard } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-overview',
        )!;
        const tile = (key: string) =>
            dashboard.tiles.find(
                (item) =>
                    item.type === DashboardTileTypes.SAVED_CHART &&
                    item.tabSlug === 'adoption' &&
                    (item.properties as { chartSlug: string }).chartSlug ===
                        `lightdash-analytics-overview-${key}`,
            )!;
        const [a, b] = ['agent-requests-trend', 'agent-requesters-trend'].map(
            tile,
        );
        expect([a.x, b.x, a.w, b.w, a.h, b.h]).toEqual([0, 18, 18, 18, 4, 4]);
        expect(a.y).toBe(b.y);
        const heatmap = tile('agent-requests-by-agent-and-day');
        expect([heatmap.x, heatmap.w, heatmap.h]).toEqual([0, 36, 7]);
        const trellis = tile('agent-daily-requests-per-agent');
        expect([trellis.x, trellis.w, trellis.h]).toEqual([0, 36, 14]);
        expect(tile('agent-adoption-by-week').w).toBe(36);
    });

    it('draws Daily requests per agent as one smooth filled row per agent', () => {
        expect(
            analyticsLibraryChartBindings.get(
                'lightdash-analytics-overview-agent-daily-requests-per-agent',
            ),
        ).toMatchObject({
            slug: 'vega-trellis',
            optionValues: {
                arrangement: 'rows',
                minPanelHeight: 70,
                sharedY: false,
                markType: 'area',
                curve: 'smooth',
                fillOpacity: 25,
                showLine: true,
                showPoints: false,
            },
        });
    });

    it('lists the Outcomes and Retries & consumption charts in order with their fallback types', () => {
        const { dashboard, charts: overviewCharts } =
            analyticsContentAsCode.find(
                ({ dashboard: item }) =>
                    item.slug === 'lightdash-analytics-overview',
            )!;
        const prefix = 'lightdash-analytics-overview-';
        const slugsFor = (tabSlug: string) =>
            dashboard.tiles
                .filter(
                    (tile) =>
                        tile.type === DashboardTileTypes.SAVED_CHART &&
                        tile.tabSlug === tabSlug,
                )
                .map(
                    (tile) =>
                        (tile.properties as { chartSlug: string }).chartSlug,
                );
        expect(slugsFor('outcomes')).toEqual(
            [
                'agent-requests-and-completion-by-day',
                'agent-request-outcomes',
                'agent-feedback-rating-and-sample-coverage',
            ].map((key) => `${prefix}${key}`),
        );
        expect(slugsFor('consumption')).toEqual(
            [
                'ai-consumption-by-person-feature-and-model',
                'ai-tokens-by-feature-and-model',
                'request-consumption-by-outcome-and-feedback',
                'agent-retries-latency-and-consumption',
            ].map((key) => `${prefix}${key}`),
        );
        const find = (key: string) =>
            overviewCharts.find(({ slug }) => slug === `${prefix}${key}`)!;
        expect(
            find('agent-requests-and-completion-by-day').chartConfig.type,
        ).toBe(ChartType.CARTESIAN);
        expect(find('ai-tokens-by-feature-and-model').chartConfig.type).toBe(
            ChartType.TABLE,
        );
        expect(find('agent-request-outcomes').chartConfig.type).toBe(
            ChartType.PIE,
        );
        expect(
            analyticsLibraryChartBindings.has(
                `${prefix}agent-request-outcomes`,
            ),
        ).toBe(false);
        expect(
            analyticsLibraryChartBindings.get(
                `${prefix}agent-requests-and-completion-by-day`,
            )?.slug,
        ).toBe('customizable-cartesian-chart');
        expect(
            analyticsLibraryChartBindings.get(
                `${prefix}ai-tokens-by-feature-and-model`,
            )?.slug,
        ).toBe('heatmap');
        expect(
            analyticsLibraryChartBindings.get(
                `${prefix}ai-consumption-by-person-feature-and-model`,
            )?.slug,
        ).toBe('customizable-cartesian-chart');
        expect(
            find('agent-feedback-rating-and-sample-coverage').chartConfig.type,
        ).toBe(ChartType.TABLE);
        expect(
            analyticsLibraryChartBindings.get(
                `${prefix}agent-feedback-rating-and-sample-coverage`,
            )?.slug,
        ).toBe('sortable-pivot-table');
        expect(
            find('request-consumption-by-outcome-and-feedback').chartConfig
                .type,
        ).toBe(ChartType.BIG_NUMBER);
        expect(
            analyticsLibraryChartBindings.get(
                `${prefix}request-consumption-by-outcome-and-feedback`,
            )?.slug,
        ).toBe('big-number-with-sparkline-trend');
    });

    it('lays out the Outcomes and Retries sections as explicit rows', () => {
        const { dashboard } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-overview',
        )!;
        const tile = (tabSlug: string, key: string) =>
            dashboard.tiles.find(
                (item) =>
                    item.type === DashboardTileTypes.SAVED_CHART &&
                    item.tabSlug === tabSlug &&
                    (item.properties as { chartSlug: string }).chartSlug ===
                        `lightdash-analytics-overview-${key}`,
            )!;
        const [a, b] = [
            'agent-requests-and-completion-by-day',
            'agent-request-outcomes',
        ].map((key) => tile('outcomes', key));
        expect([a.x, b.x, a.w, b.w, a.h, b.h]).toEqual([0, 18, 18, 18, 8, 8]);
        expect(a.y).toBe(b.y);
        const feedback = tile(
            'outcomes',
            'agent-feedback-rating-and-sample-coverage',
        );
        expect([feedback.x, feedback.w, feedback.h]).toEqual([0, 36, 7]);
        const [person, tokens] = [
            'ai-consumption-by-person-feature-and-model',
            'ai-tokens-by-feature-and-model',
        ].map((key) => tile('consumption', key));
        expect([person.x, tokens.x, person.w, tokens.w]).toEqual([
            0, 18, 18, 18,
        ]);
        expect([person.h, tokens.h]).toEqual([8, 8]);
        expect(person.y).toBe(tokens.y);
        // The card shares the last row with the retries chart, so it never sits alone on a full-width row
        const [failed, retries] = [
            'request-consumption-by-outcome-and-feedback',
            'agent-retries-latency-and-consumption',
        ].map((key) => tile('consumption', key));
        expect([failed.x, retries.x, failed.w, retries.w]).toEqual([
            0, 12, 12, 24,
        ]);
        expect([failed.h, retries.h]).toEqual([6, 6]);
        expect(failed.y).toBe(retries.y);
        expect(failed.y).toBeGreaterThan(person.y);
    });

    it('renders Agents & AI sections as one-line captions and leaves other dashboards headed', () => {
        const dashboardBySlug = (slug: string) =>
            analyticsContentAsCode.find(
                ({ dashboard }) => dashboard.slug === slug,
            )!.dashboard;
        const spec = usageDashboardSpecs.find(
            ({ key }) => key === 'lightdash-analytics-overview',
        )!;
        const overview = dashboardBySlug('lightdash-analytics-overview');
        spec.tabs.forEach((tab) => {
            const notes = overview.tiles.filter(
                (tile) =>
                    tile.tabSlug === tab.key &&
                    tile.type === DashboardTileTypes.MARKDOWN,
            );
            expect(notes).toHaveLength(tab.sections.length);
            tab.sections.forEach((section, index) => {
                expect(section.caption).toBe(true);
                expect(notes[index].h).toBe(1);
                expect(
                    (notes[index].properties as { content: string }).content,
                ).toBe(section.description);
            });
        });
        const [firstNote] = overview.tiles.filter(
            (tile) =>
                tile.tabSlug === 'adoption' &&
                tile.type === DashboardTileTypes.MARKDOWN,
        );
        const firstChart = overview.tiles.find(
            (tile) =>
                tile.tabSlug === 'adoption' &&
                tile.type === DashboardTileTypes.SAVED_CHART,
        )!;
        expect([firstNote.y, firstChart.y]).toEqual([0, 1]);
        const adoption = dashboardBySlug('lightdash-analytics-adoption');
        const [heading] = adoption.tiles.filter(
            (tile) =>
                tile.tabSlug === 'app-outcomes' &&
                tile.type === DashboardTileTypes.MARKDOWN,
        );
        expect(heading.h).toBe(2);
        expect((heading.properties as { content: string }).content).toMatch(
            /^### /,
        );
    });

    it('orders the per-agent panels by agent then day and shows summed totals compactly', () => {
        const trellis = charts.find(
            ({ slug }) =>
                slug ===
                'lightdash-analytics-overview-agent-daily-requests-per-agent',
        )!;
        expect(trellis.metricQuery.sorts).toEqual([
            { fieldId: 'agent_requests_agent_name', descending: false },
            { fieldId: 'agent_requests_requested_at_day', descending: false },
        ]);
        expect(trellis.metricQuery.limit).toBe(5000);
        const summed = [...analyticsLibraryChartBindings.values()].filter(
            (binding) =>
                binding.slug === 'big-number-with-sparkline-trend' &&
                binding.optionValues.valueAggregation === 'sum',
        );
        expect(summed.length).toBeGreaterThan(0);
        summed.forEach((binding) =>
            expect(binding.optionValues.style).toBe('compact'),
        );
    });

    it('lists the Queries sub-tab charts in order with their fallback types', () => {
        const { dashboard, charts: queryCharts } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-query-activity',
        )!;
        const prefix = 'lightdash-analytics-query-activity-';
        const slugs = (tabSlug: string) =>
            dashboard.tiles
                .filter(
                    (tile) =>
                        tile.type === DashboardTileTypes.SAVED_CHART &&
                        tile.tabSlug === tabSlug,
                )
                .map(
                    (tile) =>
                        (tile.properties as { chartSlug: string }).chartSlug,
                );
        expect(slugs('origins')).toEqual(
            [
                'query-origin-and-initiating-actor',
                'warehouse-versus-cached-demand',
            ].map((key) => `${prefix}${key}`),
        );
        expect(slugs('fields')).toEqual(
            [
                'most-used-fields-cloud',
                'most-used-fields',
                'people-using-fields',
                'content-using-fields',
                'field-capture-coverage',
            ].map((key) => `${prefix}${key}`),
        );
        const fallbackType = (key: string) =>
            queryCharts.find(({ slug }) => slug === `${prefix}${key}`)!
                .chartConfig.type;
        expect(fallbackType('query-origin-and-initiating-actor')).toBe(
            ChartType.TABLE,
        );
        expect(fallbackType('most-used-fields-cloud')).toBe(
            ChartType.CARTESIAN,
        );
        const cloud = queryCharts.find(
            ({ slug }) => slug === `${prefix}most-used-fields-cloud`,
        )!;
        expect(cloud.metricQuery.limit).toBe(20);
        expect(cloud.metricQuery.dimensions).toEqual([
            'semantic_usage_field_label',
        ]);
    });

    it('lays the Queries latency section out as an explicit row', () => {
        const { dashboard } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-query-activity',
        )!;
        const tile = (tabSlug: string, key: string) =>
            dashboard.tiles.find(
                (item) =>
                    item.type === DashboardTileTypes.SAVED_CHART &&
                    item.tabSlug === tabSlug &&
                    (item.properties as { chartSlug: string }).chartSlug ===
                        `lightdash-analytics-query-activity-${key}`,
            )!;
        const slow = tile('latency', 'slow-dashboards-tail-latency-and-demand');
        expect([slow.x, slow.w, slow.h]).toEqual([0, 36, 9]);
    });

    it('leaves the query calendar chart unchanged', () => {
        const { charts: queryCharts } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-query-activity',
        )!;
        const calendar = queryCharts.find(({ slug }) =>
            slug.endsWith('-query-calendar'),
        )!;
        expect(analyticsLibraryChartBindings.has(calendar.slug)).toBe(false);
    });

    it('draws the query calendar over a fixed 26 weeks in the palette colour', () => {
        const calendar = analyticsContentAsCode
            .flatMap(({ charts: all }) => all)
            .find(({ slug }) => slug.endsWith('-query-calendar'))!;
        // Its own period, so the grid always has the same number of columns and fills the tile
        expect(calendar.metricQuery.filters.dimensions).toMatchObject({
            and: [
                {
                    target: { fieldId: 'query_events_event_ts_raw' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [182],
                },
            ],
        });
        const spec = JSON.stringify(
            calendar.chartConfig.type === ChartType.CUSTOM
                ? calendar.chartConfig.config?.spec
                : null,
        );
        // Columns share the whole width (27 calendar weeks), from the left edge, with no cap
        expect(spec).toContain('(width / 27)');
        expect(spec).not.toContain('64)');
        // One very busy day does not turn the rest pale: colours stop at the 95th percentile
        // on the count as a number: as text, 890 would sort above 5000
        expect(spec).toContain(
            '{"calculate":"toNumber(datum.query_events_total_queries)","as":"query_count"}',
        );
        expect(spec).toContain(
            '"sort":[{"field":"query_count","order":"descending"}]',
        );
        expect(spec).toContain('ceil(datum.day_count * 0.05)');
        expect(spec).toContain('"field":"colour_value"');
        expect(spec).not.toContain('column_offset');
        // The ramp ends on the first palette colour, and the legend reads 9.3K, top right
        expect(spec).toContain(
            JSON.stringify([
                '#C7D2FE',
                analyticsColorPalette.colors[16],
                analyticsColorPalette.colors[0],
            ]),
        );
        expect(spec).toContain(
            "upper(format(datum.value, '.2~s')) + (datum.value >= domain('color')[1] ? '+' : '')",
        );
        expect(spec).toContain('"orient":"top-right"');
        // A label for every month that starts in the window
        expect(spec).toContain('utcdate(datum.grid_day) === 1');
    });

    it('captions only the Queries sections with library charts and shows the query total compactly', () => {
        const spec = usageDashboardSpecs.find(
            ({ key }) => key === 'lightdash-analytics-query-activity',
        )!;
        const { dashboard } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-query-activity',
        )!;
        const captioned = spec.tabs.flatMap(({ sections }) =>
            sections.filter(({ caption }) => caption).map(({ title }) => title),
        );
        expect(captioned).toEqual(['Response latency', 'Most-used fields']);
        spec.tabs.forEach((tab) => {
            const notes = dashboard.tiles.filter(
                (tile) =>
                    tile.tabSlug === tab.key &&
                    tile.type === DashboardTileTypes.MARKDOWN,
            );
            tab.sections.forEach((section, index) => {
                const { h, properties } = notes[index] as {
                    h: number;
                    properties: { content: string };
                };
                if (section.caption) {
                    expect(h).toBe(1);
                    expect(properties.content).toBe(section.description);
                } else {
                    // One row when the description is a single line under a bold title, else two
                    const oneLine = noteLines(section.description) === 1;
                    expect(h).toBe(oneLine ? 1 : 2);
                    expect(properties.content).toBe(
                        oneLine
                            ? `**${section.title}**  \n${section.description}`
                            : `### ${section.title}\n\n${section.description}`,
                    );
                }
            });
        });
        const queries = analyticsLibraryChartBindings.get(
            'lightdash-analytics-query-activity-queries',
        )!;
        expect(queries.optionValues).toMatchObject({
            valueAggregation: 'sum',
            style: 'compact',
        });
    });

    it('keeps tile geometry for sections without a layout hint', () => {
        const { dashboard } = analyticsContentAsCode.find(
            ({ dashboard: item }) =>
                item.slug === 'lightdash-analytics-adoption',
        )!;
        const geometry = dashboard.tiles
            .filter((tile) => tile.tabSlug === 'app-outcomes')
            .map((tile) => [tile.x, tile.y, tile.w, tile.h]);
        expect(geometry).toEqual([
            [0, 0, 36, 2],
            [0, 2, 36, 7],
            [0, 9, 36, 7],
        ]);
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

    it('keeps Embed date filters on every tile and query counts restricted to embeds', () => {
        const bundle = analyticsContentAsCode.find(
            ({ dashboard }) => dashboard.slug === 'lightdash-analytics-embed',
        )!;
        const [date] = bundle.dashboard.filters!.dimensions!;
        expect(date).toMatchObject({
            operator: FilterOperator.IN_THE_PAST,
            values: [30],
            settings: { completed: true, unitOfTime: UnitOfTime.days },
        });
        for (const chart of bundle.charts) {
            expect(chart.chartConfig.type).not.toBe(ChartType.TABLE);
            expect(date.tileTargets?.[chart.slug]).toEqual({
                fieldId: `${chart.tableName}_event_ts_day`,
                tableName: chart.tableName,
            });
            if (chart.tableName === 'query_events') {
                expect(compile(chart).query).toContain("'embed'");
                expect(chart.metricQuery.metrics).not.toContain(
                    'query_events_unique_users',
                );
            }
        }
    });

    it.each(charts.map((chart) => [chart.slug, chart] as const))(
        'compiles %s without missing fields or join warnings',
        (_slug, chart) => {
            const explore = explores.find(
                ({ name }) => name === chart.tableName,
            )!;
            expect(compile(chart).warnings).toEqual([]);
            expect(chart.metricQuery.limit).toBeLessThanOrEqual(5000);
            expect(
                chart.metricQuery.dimensions.every(
                    (field) =>
                        field.startsWith(`${explore.baseTable}_`) ||
                        chart.metricQuery.customDimensions?.some(
                            (dimension) =>
                                dimension.id === field &&
                                dimension.table === explore.baseTable,
                        ),
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
                        'export_events',
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
            await db.run(`UPDATE lightdash_people SET email = ' person@example.com '
                WHERE user_id IN ('never-a', 'never-b', 'unnamed')`);
            await db.run(`INSERT INTO content_views (org_id,user_id,event_ts,actor_type,is_qualifying) VALUES
                ('org','recent','2026-10-20 12:00:00','user',true),
                ('org','recent','2026-10-20 12:00:00','user',true),
                ('org','lapsed','2026-09-01 12:00:00','user',true)`);
            await db.run(`INSERT INTO query_events (org_id,user_id,event_ts,workload_origin,initiating_actor_type) VALUES
                ('org','scheduled','2026-10-20 12:00:00','scheduled','user')`);

            const populationCharts = charts.filter(
                ({ tableName, dashboardSlug }) =>
                    tableName === 'people_adoption' &&
                    dashboardSlug === 'lightdash-analytics-adoption',
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
                        person: 'person@example.com',
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
                        people_adoption_activity_status_name:
                            'Used Lightdash before, not in the last 30 days',
                        people_adoption_days_since_last_activity: 49n,
                    }),
                    expect.objectContaining({
                        people_adoption_user_id: 'never-a',
                        people_adoption_activity_status_name: 'No recorded use',
                        people_adoption_last_observed_activity_at_day: null,
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

            for (const email of ['NULL', "''", "'   '"]) {
                await db.run(
                    `UPDATE lightdash_people SET email = ${email} WHERE user_id = 'unnamed'`,
                );
                expect(await query(noObserved)).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            people_adoption_user_id: 'unnamed',
                            person: 'User unnamed',
                        }),
                    ]),
                );
            }

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
                `INSERT INTO lightdash_users (org_id,user_id,name) VALUES ('org','a','Alex'),('org','b','Alex'),('other','a','Wrong tenant')`,
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
            // The newest day has one person: the card never adds the two days together
            expect(rows.get('active-people-latest-day')).toEqual([
                expect.objectContaining({ user_activity_unique_users: 1n }),
            ]);
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
                    data_app_events_app_name: 'Sales',
                    data_app_events_app_id: 'app',
                }),
            ]);
            expect(rows.get('app-creators')![0]).not.toHaveProperty(
                'data_app_events_unique_apps',
            );
            // Person b also drew a chart tile with a custom chart type: that is not a data app load
            expect(rows.get('app-reader-detail')).toEqual([
                expect.objectContaining({
                    data_app_reach_user_name: 'Alex',
                    data_app_reach_user_id: 'b',
                    data_app_reach_total_loads: 2n,
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
                        data_app_reach_total_loads: 3n,
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
            ).toHaveLength(1);
            // Four queries, one of them with a full field list
            expect(
                semanticRows.get(`${prefix}field-capture-coverage`)?.[0],
            ).toMatchObject({
                semantic_usage_queries_with_field_details: 1n,
                semantic_usage_total_queries: 4n,
                field_list_share: 0.25,
            });
            await db.run(`INSERT INTO data_app_events (org_id, project_id, app_id, user_id, event_name, event_ts) VALUES
                ('org-a','project-a','app-a','person-a','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a','app-a',NULL,'data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a','historical-app','person-a','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a','app-b','person-b','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-b','app-a','person-a','data_app.view',CURRENT_TIMESTAMP),
                ('org-a','project-a',NULL,NULL,'data_app.view',CURRENT_TIMESTAMP)`);
            // A custom chart type drawing a chart tile is not a data app being used
            await db.run(`INSERT INTO data_app_events (org_id, project_id, app_id, user_id, event_name, event_ts, view_context) VALUES
                ('org-a','project-a','chart-type','person-a','data_app.view',CURRENT_TIMESTAMP,'chart'),
                ('org-a','project-a','chart-type','person-b','data_app.view',CURRENT_TIMESTAMP,'chart'),
                ('org-a','project-a','app-a','person-a','data_app.view',CURRENT_TIMESTAMP,'chart')`);
            await db.run(`INSERT INTO lightdash_content (org_id, project_id, content_type, content_id, content_name) VALUES
                ('org-a','project-a','data_app','chart-type','Big Number With Sparkline Trend'),
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
            expect(
                rows.map((row) => row.data_app_events_app_name),
            ).not.toContain('Big Number With Sparkline Trend');
            // Every tile that counts loads, viewers or data apps leaves chart tiles out
            const loadCharts = charts.filter(
                ({ slug, metricQuery }) =>
                    slug.startsWith('lightdash-analytics-apps-') &&
                    JSON.stringify(metricQuery.filters).includes(
                        'data_app.view',
                    ),
            );
            expect(loadCharts.length).toBeGreaterThanOrEqual(6);
            loadCharts.forEach(({ metricQuery }) =>
                expect(metricQuery.filters.dimensions).toMatchObject({
                    and: expect.arrayContaining([
                        expect.objectContaining({
                            target: {
                                fieldId: 'data_app_events_view_context',
                            },
                            operator: FilterOperator.NOT_EQUALS,
                            values: ['chart'],
                        }),
                    ]),
                }),
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

describe('display fixes', () => {
    it('names columns, legends and axes in plain words on Agents & AI and Queries', () => {
        const bySlug = (slug: string) =>
            charts.find((item) => item.slug === slug)!;
        const retries = bySlug(
            'lightdash-analytics-overview-agent-retries-latency-and-consumption',
        );
        if (retries.chartConfig.type !== ChartType.TABLE)
            throw new Error('Expected table');
        expect(retries.chartConfig.config?.columns).toMatchObject({
            agent_requests_retry_count: { name: 'Retries' },
            agent_requests_total_requests: { name: 'Agent requests' },
            agent_requests_total_retry_overhead_ms: {
                name: 'Time on failed attempts (ms)',
            },
            agent_requests_average_request_latency_ms: {
                name: 'Average latency (ms)',
            },
            agent_requests_total_request_tokens: { name: 'Tokens' },
        });
        const completion = bySlug(
            'lightdash-analytics-overview-agent-requests-and-completion-by-day',
        );
        if (completion.chartConfig.type !== ChartType.CARTESIAN)
            throw new Error('Expected cartesian');
        const completionConfig = completion.chartConfig.config?.eChartsConfig;
        expect(completionConfig?.xAxis?.[0].name).toBe('Day');
        expect(completionConfig?.yAxis?.[0].name).toBe('Agent requests');
        expect(completionConfig?.series?.[0].name).toBe('Agent requests');
        const slow = bySlug(
            'lightdash-analytics-query-activity-slow-dashboards-tail-latency-and-demand',
        );
        if (slow.chartConfig.type !== ChartType.TABLE)
            throw new Error('Expected table');
        expect(slow.chartConfig.config?.columns).toMatchObject({
            query_events_dashboard_name: { name: 'Dashboard' },
            query_events_total_queries: { name: 'Queries' },
            query_events_p95_response_time_ms: {
                name: 'P95 response time (ms)',
            },
        });
        // A blank axis name would fall back to the raw field label.
        const daily = bySlug(
            'lightdash-analytics-query-activity-queries-by-day',
        );
        if (daily.chartConfig.type !== ChartType.CARTESIAN)
            throw new Error('Expected cartesian');
        expect(daily.chartConfig.config?.eChartsConfig?.xAxis?.[0].name).toBe(
            'Day',
        );
        expect(
            analyticsLibraryChartBindings.get(daily.slug)?.optionValues,
        ).toMatchObject({ xName: 'Day', yName: 'Queries' });
    });

    it('queries one row for the newest day on the latest-day cards', () => {
        [
            'lightdash-analytics-overview-ai-users',
            'lightdash-analytics-overview-agent-requesters-trend',
            'lightdash-analytics-query-activity-query-users',
            'lightdash-analytics-query-activity-avg-execution-time',
            'lightdash-analytics-query-activity-p90-execution-time',
        ].forEach((slug) => {
            const chart = charts.find((item) => item.slug === slug)!;
            const [day] = chart.metricQuery.dimensions;
            expect(compile(chart).query).toMatch(
                new RegExp(`ORDER BY "${day}" DESC\\s+LIMIT 1\\s*$`),
            );
        });
    });

    const prefix = 'lightdash-analytics-overview-';
    const byKey = (key: string) =>
        charts.find(({ slug }) => slug === `${prefix}${key}`)!;

    it('shows millisecond metrics as whole numbers and leaves others alone', () => {
        const retries = byKey('agent-retries-latency-and-consumption');
        expect(retries.metricQuery.metricOverrides).toEqual({
            agent_requests_total_retry_overhead_ms: {
                formatOptions: { type: 'number', round: 0 },
            },
            agent_requests_average_request_latency_ms: {
                formatOptions: { type: 'number', round: 0 },
            },
        });
        expect(
            byKey('agent-requests-trend').metricQuery.metricOverrides,
        ).toEqual({});
    });

    it('keeps percent formatting for rate metrics', () => {
        const rated = charts.flatMap(({ metricQuery }) =>
            metricQuery.metrics
                .filter((field) => field.endsWith('_rate'))
                .map((field) => metricQuery.metricOverrides?.[field]),
        );
        expect(rated.length).toBeGreaterThan(0);
        rated.forEach((override) =>
            expect(override).toEqual({
                formatOptions: { type: 'percent', round: 1 },
            }),
        );
    });

    it('titles the retries axes', () => {
        expect(
            analyticsLibraryChartBindings.get(
                `${prefix}agent-retries-latency-and-consumption`,
            )?.optionValues,
        ).toMatchObject({
            xName: 'Retries',
            yName: 'Agent requests',
            yRightName: 'Average latency (ms)',
        });
    });

    it('shows Queries latency in whole milliseconds with titled axes', () => {
        const rounded = { formatOptions: { type: 'number', round: 0 } };
        const bySuffix = (key: string) =>
            charts.find(
                ({ slug }) =>
                    slug.startsWith('lightdash-analytics-query-activity-') &&
                    slug.endsWith(`-${key}`),
            )!;
        const slow = bySuffix('slow-dashboards-tail-latency-and-demand');
        expect(slow.metricQuery.metricOverrides).toEqual({
            query_events_p95_response_time_ms: rounded,
            query_events_avg_warehouse_execution_time_ms: rounded,
        });
        expect(
            analyticsLibraryChartBindings.get(slow.slug)?.optionValues,
        ).toMatchObject({
            yName: 'Queries',
            yRightName: 'P95 response time (ms)',
        });
        ['avg-execution-time', 'p90-execution-time'].forEach((key) => {
            const [metric] = bySuffix(key).metricQuery.metrics;
            expect(bySuffix(key).metricQuery.metricOverrides).toEqual({
                [metric]: rounded,
            });
        });
    });

    it('shows feedback as one row per agent with the counts behind each share', () => {
        const feedback = byKey('agent-feedback-rating-and-sample-coverage');
        expect(feedback.name).toBe('Feedback by agent');
        if (feedback.chartConfig.type !== ChartType.TABLE)
            throw new Error('Expected table');
        expect(feedback.chartConfig.config?.columns).toMatchObject({
            agent_requests_agent_name: { name: 'Agent' },
            agent_requests_agent_id: { visible: false },
            agent_requests_total_requests: { name: 'Requests' },
            agent_requests_feedback_coverage: { name: 'Share rated' },
            agent_requests_negative_feedback_rate: { name: 'Negative share' },
            // The plain table shows the share as a percentage already
            share_rated_percent: { visible: false },
        });
        expect(
            feedback.metricQuery.tableCalculations.map(
                ({ name, displayName }) => [name, displayName],
            ),
        ).toEqual([
            ['rated_requests', 'Rated'],
            ['share_rated_percent', 'Share rated (%)'],
            ['negative_ratings', 'Negative'],
        ]);
        expect(feedback.metricQuery.sorts).toEqual([
            { fieldId: 'agent_requests_total_requests', descending: true },
        ]);
        const binding = analyticsLibraryChartBindings.get(feedback.slug)!;
        expect(binding).toMatchObject({
            slug: 'sortable-pivot-table',
            minVersion: '0.14.0',
            fieldMapping: {
                rowDimension: 'agent_requests_agent_name',
                metric: [
                    'agent_requests_total_requests',
                    'rated_requests',
                    'share_rated_percent',
                    'negative_ratings',
                ],
            },
            optionValues: {
                initialSort: 'firstValue',
                rowHeaderName: 'Agent',
                valueNames: 'Requests,Rated,Share rated (%),Negative',
                density: 'compact',
                decimalPlaces: 0,
                showTotalsRow: false,
                showMiniBars: false,
            },
            // The counts are table calculations, which only the shared query keeps
            query: null,
        });
    });

    it('counts rated and negative requests exactly from the two shares', async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
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
            await db.run(`INSERT INTO lightdash_agents VALUES
                ('org','busy','Busy agent'), ('org','quiet','Quiet agent')`);
            // Busy agent: seven requests, three rated, one of them negative. Sevenths do not divide evenly.
            // Quiet agent: one request with no rating.
            const scores: (number | null)[] = [
                1,
                1,
                -1,
                null,
                null,
                null,
                null,
            ];
            for (const [index, score] of scores.entries()) {
                await db.run(`INSERT INTO agent_request_events
                    (org_id, project_id, user_id, agent_id, thread_id, prompt_id, event_id, event_ts, stage, outcome, human_score, surface) VALUES
                    ('org','project','user','busy','thread','p${index}','created:p${index}','2026-09-29 10:00:00','created',NULL,NULL,'web_app')
                    ${score === null ? '' : `, ('org','project','user','busy','thread','p${index}','rating:p${index}','2026-09-29 10:01:00','feedback_updated',NULL,${score},NULL)`}`);
            }
            await db.run(`INSERT INTO agent_request_events
                (org_id, project_id, user_id, agent_id, thread_id, prompt_id, event_id, event_ts, stage, outcome, human_score, surface) VALUES
                ('org','project','user','quiet','thread','q0','created:q0','2026-09-29 10:00:00','created',NULL,NULL,'web_app')`);
            const rows = (
                await db.runAndReadAll(
                    compile(byKey('agent-feedback-rating-and-sample-coverage'))
                        .query,
                )
            ).getRowObjectsJS();
            expect(
                rows.map((row) => [
                    row.agent_requests_agent_name,
                    Number(row.agent_requests_total_requests),
                    row.rated_requests === null
                        ? null
                        : Number(row.rated_requests),
                    Number(row.share_rated_percent),
                    Number(row.negative_ratings),
                ]),
            ).toEqual([
                ['Busy agent', 7, 3, 43, 1],
                ['Quiet agent', 1, 0, 0, 0],
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    it('totals the tokens of failed or cancelled requests on a card, with their share of all tokens', () => {
        const failedTokens =
            'agent_requests_failed_or_cancelled_request_tokens';
        const failed = byKey('request-consumption-by-outcome-and-feedback');
        expect(failed.name).toBe(
            'Tokens spent on failed or cancelled requests',
        );
        expect(failed.chartConfig).toMatchObject({
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: failedTokens,
            },
        });
        expect(failed.metricQuery.dimensions).toEqual([]);
        expect(failed.metricQuery.metrics).toEqual([failedTokens]);
        // The measure keeps only failed and cancelled requests itself (clarification and pending are not
        // failures), so the query has no outcome filter and can also total every request's tokens
        expect(failed.metricQuery.filters.dimensions).toBeUndefined();
        expect(compile(failed).query).toContain("IN ('error','cancelled')");
        const binding = analyticsLibraryChartBindings.get(failed.slug)!;
        expect(binding).toMatchObject({
            slug: 'big-number-with-sparkline-trend',
            fieldMapping: {
                value: failedTokens,
                sparklineMetric: failedTokens,
                time: 'agent_requests_requested_at_day',
                secondary: 'failed_token_share',
            },
            optionValues: {
                valueAggregation: 'sum',
                label: 'Selected period',
                showSparklineArea: true,
                secondaryLabel: 'of all tokens used by agent requests',
            },
            query: {
                dimensions: ['agent_requests_requested_at_day'],
                metrics: [failedTokens, 'agent_requests_total_request_tokens'],
            },
        });
        // The share is the same on every row, so the card can read it from any day
        expect(binding.query?.tableCalculations).toMatchObject([
            {
                name: 'failed_token_share',
                sql: expect.stringMatching(/OVER \(\).*OVER \(\)/),
            },
        ]);
    });
});
