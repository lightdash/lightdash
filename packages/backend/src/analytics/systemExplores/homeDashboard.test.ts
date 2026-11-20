import {
    ChartType,
    DashboardTileTypes,
    FilterOperator,
    UnitOfTime,
    WarehouseTypes,
    type ChartAsCode,
    type DataAppVizSchema,
    type Filters,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { homeChartSpecs, homeDashboardSpec } from './homeDashboard';
import {
    libraryChartFields,
    withLibraryCharts,
    type UsableLibraryChartType,
} from './libraryCharts';
import {
    analyticsContentAsCode,
    analyticsLibraryChartBindings,
} from './sampleContent';

const slug = 'lightdash-analytics-home';
const { dashboard, charts } = analyticsContentAsCode.find(
    (bundle) => bundle.dashboard.slug === slug,
)!;
const chartOf = (key: string) =>
    charts.find((chart) => chart.slug === `${slug}-${key}`)!;
const bindingOf = (key: string) =>
    analyticsLibraryChartBindings.get(`${slug}-${key}`)!;
const explores = createAnalyticsExplores();
const sqlOf = (chart: ChartAsCode) => {
    const explore = explores.find(({ name }) => name === chart.tableName)!;
    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        WarehouseTypes.DUCKDB,
    );
    return new MetricQueryBuilder({
        explore,
        compiledMetricQuery: compileMetricQuery({
            explore,
            metricQuery: {
                ...chart.metricQuery,
                filters: chart.metricQuery.filters as Filters,
            },
            warehouseSqlBuilder,
            availableParameters: [],
        }),
        warehouseSqlBuilder,
        intrinsicUserAttributes: {},
        parameterDefinitions: {},
        timezone: 'UTC',
    }).compileQuery().query;
};

// Every type the dashboard binds, installed at exactly the version its bindings need, declaring the
// fields the type accepts and the options the bindings set
const installedTypes = (): Map<string, UsableLibraryChartType> => {
    const types = new Map<string, UsableLibraryChartType>();
    charts.forEach((chart) => {
        const binding = analyticsLibraryChartBindings.get(chart.slug);
        if (!binding) return;
        const known = types.get(binding.slug)?.vizSchema.configOptions ?? [];
        const options = Object.entries(binding.optionValues)
            .filter(([name]) => !known.some((option) => option.name === name))
            .map(([name, value]) => {
                if (typeof value === 'boolean')
                    return {
                        type: 'boolean' as const,
                        name,
                        label: name,
                        default: value,
                    };
                if (typeof value === 'number')
                    return {
                        type: 'number' as const,
                        name,
                        label: name,
                        default: value,
                    };
                return {
                    type: 'text' as const,
                    name,
                    label: name,
                    default: String(value),
                };
            });
        const vizSchema: DataAppVizSchema = {
            fields: libraryChartFields[binding.slug].fields.map((name) => ({
                name,
                label: name,
                type: 'column',
                required:
                    libraryChartFields[binding.slug].required.includes(name),
                multiple: Array.isArray(binding.fieldMapping[name]),
            })),
            configOptions: [...known, ...options],
            colorPalette: null,
        };
        types.set(binding.slug, {
            appSlug: `${binding.slug}-1`,
            vizSchema,
            registryVersion: binding.minVersion,
        });
    });
    return types;
};

const cards = ['active-people', 'queries', 'agent-requests', 'content-created'];
const trends = ['people-by-day', 'queries-by-day', 'agent-requests-by-day'];
const table = 'most-active-people';

describe('Overview dashboard', () => {
    it('is one verified dashboard called Overview with a single tab', () => {
        expect(dashboard).toMatchObject({
            name: 'Overview',
            verified: true,
            tabs: [{ slug: 'overview', name: 'Overview', order: 0 }],
        });
        expect(charts.map((chart) => chart.slug)).toEqual(
            [...cards, ...trends, table].map((key) => `${slug}-${key}`),
        );
    });

    it('lays out four cards, three full-width trends and the table, with no text tiles', () => {
        expect(
            dashboard.tiles.every(
                (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
            ),
        ).toBe(true);
        expect(
            dashboard.tiles.map((tile) => [
                (tile.properties as { chartSlug: string }).chartSlug.slice(
                    slug.length + 1,
                ),
                tile.x,
                tile.y,
                tile.w,
                tile.h,
            ]),
        ).toEqual([
            ['active-people', 0, 0, 9, 4],
            ['queries', 9, 0, 9, 4],
            ['agent-requests', 18, 0, 9, 4],
            ['content-created', 27, 0, 9, 4],
            ['people-by-day', 0, 4, 36, 5],
            ['queries-by-day', 0, 9, 36, 5],
            ['agent-requests-by-day', 0, 14, 36, 5],
            ['most-active-people', 0, 19, 36, 8],
        ]);
    });

    it('names the tiles in the agreed words', () => {
        expect(charts.map((chart) => chart.name)).toEqual([
            'Active people',
            'Queries',
            'Agent requests',
            'Content created',
            'People with any recorded activity by day',
            'Queries by day',
            'Agent requests by day',
            'Most active people (top 10)',
        ]);
        const copy = [
            dashboard.name,
            dashboard.description,
            ...homeChartSpecs.flatMap((spec) => [
                spec.name,
                spec.description,
                spec.libraryChart?.query?.description ?? '',
                ...Object.values(spec.fieldLabels ?? {}),
            ]),
        ]
            .join(' ')
            // The name the data itself gives a person with no display name
            .replaceAll('Unknown user', '');
        expect(copy).not.toMatch(
            /\b(users?|observed|captured|retained|coverage|logical|Ask AI|AI agent|agent questions)\b|—/i,
        );
        homeChartSpecs.forEach((spec) => expect(spec.name).not.toMatch(/\.$/));
    });

    describe('without the library chart types', () => {
        it('shows big numbers, plain lines and a plain table', () => {
            const { charts: plain, rejected } = withLibraryCharts(
                charts,
                analyticsLibraryChartBindings,
                new Map(),
            );
            expect(rejected).toEqual([]);
            expect(plain).toEqual(charts);
            cards.forEach((key) =>
                expect(chartOf(key).chartConfig.type).toBe(
                    ChartType.BIG_NUMBER,
                ),
            );
            trends.forEach((key) => {
                const { chartConfig } = chartOf(key);
                expect(chartConfig.type).toBe(ChartType.CARTESIAN);
                expect(
                    chartConfig.type === ChartType.CARTESIAN &&
                        chartConfig.config?.eChartsConfig.series?.map(
                            (series) => series.type,
                        ),
                ).toEqual(['line']);
            });
            expect(chartOf(table).chartConfig.type).toBe(ChartType.TABLE);
        });

        it('names the axes and columns in plain words', () => {
            const people = chartOf('people-by-day').chartConfig;
            expect(
                people.type === ChartType.CARTESIAN &&
                    people.config?.eChartsConfig,
            ).toMatchObject({
                xAxis: [{ name: 'Day' }],
                yAxis: [{ name: 'People' }],
            });
            const ranked = chartOf(table).chartConfig;
            expect(
                ranked.type === ChartType.TABLE && ranked.config?.columns,
            ).toMatchObject({
                user_activity_total_events: { name: 'Recorded activities' },
                user_activity_total_queries: { name: 'Queries' },
                user_activity_total_ai_calls: { name: 'AI calls' },
            });
        });
    });

    describe('with the library chart types installed', () => {
        const { charts: swapped, rejected } = withLibraryCharts(
            charts,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        const swappedOf = (key: string) =>
            swapped.find((chart) => chart.slug === `${slug}-${key}`)!;

        it('draws every tile with its library type', () => {
            expect(rejected).toEqual([]);
            expect(
                swapped.map(({ chartConfig }) =>
                    chartConfig.type === ChartType.DATA_APP_VIZ
                        ? chartConfig.config?.dataAppVizSlug
                        : chartConfig.type,
                ),
            ).toEqual([
                ...cards.map(() => 'big-number-with-sparkline-trend-1'),
                ...trends.map(() => 'vega-trellis-1'),
                'sortable-pivot-table-1',
            ]);
        });

        it('falls back when an installed type is older than the binding needs', () => {
            const types = installedTypes();
            types.set('sortable-pivot-table', {
                ...types.get('sortable-pivot-table')!,
                registryVersion: '0.13.1',
            });
            const result = withLibraryCharts(
                charts,
                analyticsLibraryChartBindings,
                types,
            );
            expect(result.rejected.map(({ chartSlug }) => chartSlug)).toEqual([
                `${slug}-${table}`,
            ]);
            expect(result.charts.at(-1)).toBe(chartOf(table));
        });

        it('gives the cards a filled daily trend and says what the number covers', () => {
            cards.forEach((key) => {
                const { optionValues, fieldMapping, minVersion } =
                    bindingOf(key);
                const [day] = swappedOf(key).metricQuery.dimensions;
                // A short card has no room for a change badge under the number
                expect(minVersion).toBe('0.7.1');
                expect(optionValues).toMatchObject({
                    showComparison: false,
                    showSparklineArea: true,
                    colorSparklineByTrend: false,
                    showLabel: true,
                    showCardBorder: false,
                    showCardShadow: false,
                });
                expect(fieldMapping.time).toBe(day);
                expect(swappedOf(key).metricQuery.sorts).toEqual([
                    { fieldId: day, descending: false },
                ]);
            });
        });

        it('draws each trend as one smooth filled row on its own scale', () => {
            trends.forEach((key) => {
                const binding = bindingOf(key);
                expect(binding.minVersion).toBe('0.6.2');
                expect(binding.fieldMapping.panel).toBeUndefined();
                expect(binding.optionValues).toEqual({
                    arrangement: 'rows',
                    minPanelHeight: 70,
                    sharedY: false,
                    markType: 'area',
                    curve: 'smooth',
                    fillOpacity: 25,
                    showLine: true,
                    showPoints: false,
                });
                // Same query as the plain line
                expect(swappedOf(key).metricQuery).toEqual(
                    chartOf(key).metricQuery,
                );
            });
        });

        it('ranks the ten most active people in the query, with mini bars and no total', () => {
            const binding = bindingOf(table);
            expect(binding.minVersion).toBe('0.14.0');
            expect(binding.optionValues).toEqual({
                showMiniBars: true,
                showTotalsRow: false,
                decimalPlaces: 0,
                density: 'compact',
                initialSort: 'firstValue',
                rowHeaderName: 'Person',
                valueNames: 'Recorded activities,Queries,AI calls',
            });
            const { metricQuery } = swappedOf(table);
            expect(metricQuery.dimensions).toEqual(['user_activity_user_name']);
            expect(metricQuery.metrics).toEqual([
                'user_activity_total_events',
                'user_activity_total_queries',
                'user_activity_total_ai_calls',
            ]);
            expect(metricQuery.sorts).toEqual([
                { fieldId: 'user_activity_total_events', descending: true },
            ]);
            expect(metricQuery.limit).toBe(10);
            expect(chartOf(table).metricQuery.sorts).toEqual(metricQuery.sorts);
            expect(chartOf(table).metricQuery.limit).toBe(10);
        });
    });

    describe('what each card counts', () => {
        it('shows the latest day for the distinct count of people, in both versions', () => {
            const day = 'user_activity_activity_date_day';
            const fallback = chartOf('active-people');
            expect(fallback.metricQuery.dimensions).toEqual([day]);
            expect(fallback.metricQuery.metrics).toEqual([
                'user_activity_unique_users',
            ]);
            expect(fallback.metricQuery.limit).toBe(1);
            // A big number shows the first row: one row, newest day first
            expect(sqlOf(fallback)).toMatch(
                new RegExp(`ORDER BY "${day}" DESC\\s+LIMIT 1\\s*$`),
            );
            expect(bindingOf('active-people').optionValues).toMatchObject({
                valueAggregation: 'latest',
                label: 'Latest day',
            });
            expect(fallback.description).toContain(
                'on the latest day in the selected period',
            );
        });

        it('never sums a distinct count across days', () => {
            const distinct = explores.flatMap((explore) =>
                Object.values(explore.tables).flatMap((item) =>
                    Object.values(item.metrics)
                        .filter(({ type }) => type === 'count_distinct')
                        .map((metric) => `${item.name}_${metric.name}`),
                ),
            );
            expect(distinct).toContain('user_activity_unique_users');
            cards.forEach((key) => {
                const { fieldMapping, optionValues } = bindingOf(key);
                expect(optionValues.valueAggregation).toBe(
                    distinct.includes(String(fieldMapping.value))
                        ? 'latest'
                        : 'sum',
                );
            });
        });

        it('totals the selected period for the three counts, in both versions', () => {
            ['queries', 'agent-requests', 'content-created'].forEach((key) => {
                const fallback = chartOf(key);
                // No day in the query: one row holding the total for the period
                expect(fallback.metricQuery.dimensions).toEqual([]);
                expect(bindingOf(key).optionValues).toMatchObject({
                    valueAggregation: 'sum',
                    label: 'Selected period',
                });
                expect(bindingOf(key).query?.metrics).toEqual(
                    fallback.metricQuery.metrics,
                );
            });
        });

        it('counts charts and dashboards outside preview projects as content', () => {
            expect(sqlOf(chartOf('content-created'))).toMatch(
                /content_type"\) IN \('saved_chart','sql_chart','dashboard'\)[\s\S]*project_type"\) NOT IN \('PREVIEW'\)/,
            );
        });
    });

    describe('filters', () => {
        const filterOf = (label: string) =>
            dashboard.filters?.dimensions?.find(
                (filter) => filter.label === label,
            )!;

        it('has the Date and Project filters the Settings controls drive', () => {
            expect(
                dashboard.filters?.dimensions?.map(({ label }) => label),
            ).toEqual(['Date', 'Project']);
            expect(filterOf('Date')).toMatchObject({
                operator: FilterOperator.IN_THE_PAST,
                values: [30],
                settings: { unitOfTime: UnitOfTime.days, completed: true },
            });
            expect(filterOf('Project')).toMatchObject({
                operator: FilterOperator.EQUALS,
                values: [],
                disabled: true,
            });
        });

        it('points every tile at the day and project of its own table', () => {
            const targets = (label: string) =>
                Object.fromEntries(
                    Object.entries(filterOf(label).tileTargets ?? {}).map(
                        ([chartSlug, target]) => [
                            chartSlug.slice(slug.length + 1),
                            target && target.fieldId,
                        ],
                    ),
                );
            expect(targets('Date')).toEqual({
                'active-people': 'user_activity_activity_date_day',
                queries: 'query_events_event_ts_day',
                'agent-requests': 'agent_requests_requested_at_day',
                // The day the content was created
                'content-created': 'content_health_created_at_day',
                'people-by-day': 'user_activity_activity_date_day',
                'queries-by-day': 'query_events_event_ts_day',
                'agent-requests-by-day': 'agent_requests_requested_at_day',
                'most-active-people': 'user_activity_activity_date_day',
            });
            expect(targets('Project')).toEqual({
                'active-people': 'user_activity_project_id',
                queries: 'query_events_project_id',
                'agent-requests': 'agent_requests_project_id',
                'content-created': 'content_health_project_id',
                'people-by-day': 'user_activity_project_id',
                'queries-by-day': 'query_events_project_id',
                'agent-requests-by-day': 'agent_requests_project_id',
                'most-active-people': 'user_activity_project_id',
            });
            const fields = (name: string) => {
                const explore = explores.find((item) => item.name === name)!;
                return Object.keys(
                    explore.tables[explore.baseTable].dimensions,
                ).map((field) => `${explore.baseTable}_${field}`);
            };
            charts.forEach((chart) => {
                const key = chart.slug.slice(slug.length + 1);
                expect(fields(chart.metricQuery.exploreName)).toEqual(
                    expect.arrayContaining([
                        targets('Date')[key],
                        targets('Project')[key],
                    ]),
                );
            });
        });
    });

    it('has one section per row of tiles and no text above them', () => {
        expect(
            homeDashboardSpec.tabs[0].sections.map(({ note }) => note),
        ).toEqual([false, false, false, false, false]);
    });
});
