/* eslint-disable no-await-in-loop -- One native DuckDB connection. */
import { DuckDBInstance } from '@duckdb/node-api';
import {
    ChartType,
    compareSemverVersions,
    DashboardTileTypes,
    WarehouseTypes,
    type ChartAsCode,
    type DataAppVizSchema,
    type Filters,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import {
    libraryChartFields,
    libraryChartOptions,
    withLibraryCharts,
    type UsableLibraryChartType,
} from './libraryCharts';
import {
    analyticsContentAsCode,
    analyticsLibraryChartBindings,
} from './sampleContent';
import { topCategoryRank } from './usageDashboards';

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
const metricTypes = new Map<string, string>(
    explores.flatMap((explore) =>
        Object.values(explore.tables).flatMap((table) =>
            Object.values(table.metrics).map(
                (metric) =>
                    [`${table.name}_${metric.name}`, metric.type] as const,
            ),
        ),
    ),
);

// Every library type, installed at the given version (or the highest version any binding asks for),
// declaring the fields and the options the type accepts
const installedTypes = (
    version?: string,
): Map<string, UsableLibraryChartType> =>
    new Map(
        Object.keys(libraryChartFields).map((slug) => {
            const bindings = [...analyticsLibraryChartBindings.values()].filter(
                (binding) => binding.slug === slug,
            );
            const sample = (name: string) =>
                bindings.find((binding) => name in binding.optionValues)
                    ?.optionValues[name];
            const vizSchema: DataAppVizSchema = {
                fields: libraryChartFields[slug].fields.map((name) => ({
                    name,
                    label: name,
                    type: 'column',
                    required: libraryChartFields[slug].required.includes(name),
                    multiple: bindings.some((binding) =>
                        Array.isArray(binding.fieldMapping[name]),
                    ),
                })),
                configOptions: Object.keys(libraryChartOptions[slug]).map(
                    (name) => {
                        const value = sample(name);
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
                            default: String(value ?? ''),
                        };
                    },
                ),
                colorPalette: null,
            };
            const highest = bindings
                .map(({ minVersion }) => minVersion)
                .sort(compareSemverVersions)
                .at(-1);
            return [
                slug,
                {
                    appSlug: slug,
                    vizSchema,
                    registryVersion: version ?? highest ?? '0.0.0',
                },
            ];
        }),
    );

// What each redesigned dashboard shows: per tab, every chart tile in reading order with its position
// (x, y, width, height), the library chart that draws it and the plain chart it falls back to.
type Tile = [
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    library: string | null,
    fallback: string,
];
const redesigned: Record<string, Record<string, Tile[]>> = {
    'lightdash-analytics-people': {
        activity: [
            [
                'people-active-latest-day',
                0,
                1,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'people-recorded-activities',
                18,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'people-queries',
                27,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'daily-observed-active-people',
                0,
                5,
                36,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'people-activity-by-type-and-day',
                0,
                10,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'power-users-queries-ai-and-exports',
                0,
                17,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
        channels: [
            [
                'people-google-sheets-queries-by-day',
                0,
                1,
                36,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'google-sheets-query-audience',
                0,
                6,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
    },
    'lightdash-analytics-content': {
        audience: [
            [
                'content-viewers-latest-day',
                0,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'content-views',
                12,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'verified-content-audience-share',
                24,
                1,
                12,
                4,
                null,
                'big_number',
            ],
            [
                'content-views-by-type-and-day',
                0,
                5,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'content-reach-distinct-people-not-just-views',
                0,
                12,
                18,
                9,
                'sortable-pivot-table',
                'table',
            ],
            [
                'who-visited-which-dashboard',
                18,
                12,
                18,
                9,
                'sortable-pivot-table',
                'table',
            ],
        ],
        adoption: [
            [
                'new-content-adoption-creation-week-proxy',
                0,
                1,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'content-creation-by-month',
                0,
                9,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
        ],
        health: [
            [
                'content-by-activity-status',
                0,
                1,
                36,
                6,
                'sortable-pivot-table',
                'table',
            ],
            [
                'review-candidates-activity-and-known-dependencies',
                0,
                7,
                36,
                8,
                null,
                'table',
            ],
        ],
        ownership: [
            [
                'content-ownership-current-snapshot',
                0,
                1,
                36,
                7,
                'sortable-pivot-table',
                'pie',
            ],
            [
                'high-compute-dashboards-audience-versus-warehouse-time',
                0,
                9,
                36,
                8,
                'sortable-pivot-table',
                'cartesian',
            ],
        ],
    },
    'lightdash-analytics-apps': {
        usage: [
            [
                'apps-viewers-latest-day',
                0,
                1,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'total-loads',
                18,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'apps-loaded-latest-day',
                27,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'apps-loads-by-app-and-day',
                0,
                6,
                36,
                14,
                'vega-trellis',
                'table',
            ],
            ['top-apps', 0, 21, 36, 8, 'sortable-pivot-table', 'table'],
        ],
        people: [
            ['top-people', 0, 1, 18, 9, 'sortable-pivot-table', 'table'],
            ['user-app-detail', 18, 1, 18, 9, 'sortable-pivot-table', 'table'],
        ],
        builders: [
            [
                'apps-builds-by-type-and-day',
                0,
                1,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            ['apps-builders', 0, 8, 18, 8, 'sortable-pivot-table', 'table'],
            [
                'app-lifecycle-build-activity-versus-loads',
                18,
                8,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'apps-generation-tokens-by-day',
                0,
                17,
                36,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'app-generation-consumption',
                0,
                22,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
    },
    'lightdash-analytics-tools': {
        mcp: [
            [
                'tools-mcp-people-latest-day',
                0,
                1,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-mcp-calls',
                18,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-mcp-failed-calls',
                27,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-mcp-calls-by-tool-and-day',
                0,
                5,
                36,
                14,
                'vega-trellis',
                'table',
            ],
            ['tools-mcp-tools-cloud', 0, 19, 18, 9, 'word-cloud', 'cartesian'],
            [
                'mcp-users-clients-tools-and-error-rates',
                18,
                19,
                18,
                9,
                'sortable-pivot-table',
                'table',
            ],
        ],
        exports: [
            [
                'tools-downloads',
                0,
                2,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-people-downloading-latest-day',
                12,
                2,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-csv-downloads',
                24,
                2,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-downloads-by-format-and-day',
                0,
                6,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'export-audit-actor-content-and-outcome',
                0,
                13,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
    },
    'lightdash-analytics-agent-evaluations': {
        quality: [
            [
                'evals-runs',
                0,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'evals-passed-assessments',
                12,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'evals-failed-assessments',
                24,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'assessment-pass-rate-by-day',
                0,
                5,
                18,
                8,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'assessment-volume-by-day',
                18,
                5,
                18,
                8,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'quality-by-evaluation',
                0,
                14,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
            ['recent-evaluation-runs', 0, 22, 36, 7, null, 'table'],
        ],
    },
    'lightdash-analytics-adoption': {
        'people-content': [
            [
                'adoption-active-people-latest-day',
                0,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'adoption-dashboard-viewers-latest-day',
                12,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'adoption-app-viewers-latest-day',
                24,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'adoption-active-people-day',
                0,
                5,
                18,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-active-people-week',
                18,
                5,
                18,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-activity-by-person-and-day',
                0,
                10,
                36,
                9,
                'heatmap',
                'table',
            ],
            [
                'adoption-dashboard-audience',
                0,
                20,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'adoption-app-audience',
                18,
                20,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
        inactive: [
            [
                'people-without-observed-activity',
                0,
                1,
                36,
                4,
                null,
                'big_number',
            ],
            [
                'people-without-observed-activity-detail',
                0,
                6,
                36,
                7,
                null,
                'table',
            ],
            ['people-without-activity-30d-detail', 0, 13, 36, 7, null, 'table'],
        ],
        'data-apps': [
            [
                'adoption-apps-created-by-day',
                0,
                1,
                36,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-app-creators',
                0,
                6,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'adoption-app-reader-trend',
                0,
                16,
                36,
                8,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-app-reader-detail',
                0,
                24,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'adoption-app-first-audience',
                18,
                24,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
        'app-outcomes': [
            [
                'adoption-app-outcome-trend',
                0,
                2,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            ['adoption-app-outcome-detail', 0, 9, 36, 7, null, 'table'],
        ],
        'ask-ai': [
            [
                'adoption-ask-ai-questions',
                0,
                1,
                36,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-ask-ai-people',
                0,
                6,
                18,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-ask-ai-frequency',
                18,
                6,
                18,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-ask-ai-users',
                0,
                12,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'adoption-ask-ai-agents',
                18,
                12,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
        ],
    },
    'lightdash-analytics-embed': {
        audience: [
            [
                'embed-viewers-latest-day',
                0,
                1,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'embed-loads',
                18,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'embed-dashboards-latest-day',
                27,
                1,
                9,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            ['embed-load-trend', 0, 6, 36, 5, 'vega-trellis', 'cartesian'],
            ['embed-popular-dashboards', 0, 12, 18, 8, null, 'custom'],
            [
                'embed-identity-coverage',
                18,
                12,
                18,
                8,
                'customizable-cartesian-chart',
                'pie',
            ],
        ],
        'query-health': [
            [
                'embed-query-count',
                0,
                2,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'embed-query-errors',
                18,
                2,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            ['embed-query-trend', 0, 7, 18, 7, 'vega-trellis', 'cartesian'],
            [
                'embed-query-latency',
                18,
                7,
                18,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'embed-query-outcomes',
                0,
                15,
                18,
                7,
                'customizable-cartesian-chart',
                'pie',
            ],
            [
                'embed-query-cache',
                18,
                15,
                18,
                7,
                'customizable-cartesian-chart',
                'pie',
            ],
        ],
    },
};

// Descriptions that predate the redesign, on charts it left as they were
const untouchedCopy: string[] = [];

describe.each(Object.entries(redesigned))('%s', (slug, tabs) => {
    const { dashboard, charts } = analyticsContentAsCode.find(
        (bundle) => bundle.dashboard.slug === slug,
    )!;
    const chartOf = (chartSlug: string) =>
        charts.find((chart) => chart.slug === chartSlug)!;
    const chartTiles = dashboard.tiles.filter(
        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
    );
    const slugOf = (tile: (typeof chartTiles)[number]) =>
        (tile.properties as { chartSlug: string }).chartSlug;
    const bound = charts.filter(({ slug: chartSlug }) =>
        analyticsLibraryChartBindings.has(chartSlug),
    );

    it('shows these tiles, in this order, at these positions', () => {
        expect(dashboard.tabs.map((tab) => tab.slug)).toEqual(
            Object.keys(tabs),
        );
        Object.entries(tabs).forEach(([tab, expected]) => {
            expect(
                chartTiles
                    .filter((tile) => tile.tabSlug === tab)
                    .map((tile) => {
                        const chartSlug = slugOf(tile);
                        return [
                            chartSlug.slice(slug.length + 1),
                            tile.x,
                            tile.y,
                            tile.w,
                            tile.h,
                            analyticsLibraryChartBindings.get(chartSlug)
                                ?.slug ?? null,
                            chartOf(chartSlug).chartConfig.type,
                        ];
                    }),
            ).toEqual(expected);
        });
    });

    it('fills every row of the 36-column grid without overlaps', () => {
        dashboard.tabs.forEach((tab) => {
            const tiles = dashboard.tiles.filter(
                (tile) => tile.tabSlug === tab.slug,
            );
            const rows = new Map<number, typeof tiles>();
            tiles.forEach((tile) =>
                rows.set(tile.y, [...(rows.get(tile.y) ?? []), tile]),
            );
            rows.forEach((row) => {
                expect(row.reduce((total, tile) => total + tile.w, 0)).toBe(36);
                expect(new Set(row.map((tile) => tile.h)).size).toBe(1);
            });
            // Each row starts where the one above it ends
            const starts = [...rows.keys()].sort((a, b) => a - b);
            starts.forEach((y, index) => {
                if (index === 0) expect(y).toBe(0);
                else {
                    const above = starts[index - 1];
                    expect(y).toBe(above + rows.get(above)![0].h);
                }
            });
        });
    });

    it('keeps every tab to eight chart tiles', () => {
        dashboard.tabs.forEach((tab) =>
            expect(
                chartTiles.filter((tile) => tile.tabSlug === tab.slug).length,
            ).toBeLessThanOrEqual(8),
        );
    });

    it('draws only plain charts when the library chart types are missing', () => {
        const { charts: plain, rejected } = withLibraryCharts(
            charts,
            analyticsLibraryChartBindings,
            new Map(),
        );
        expect(rejected).toEqual([]);
        expect(plain).toEqual(charts);
        charts.forEach(({ chartConfig }) =>
            expect(chartConfig.type).not.toBe(ChartType.DATA_APP_VIZ),
        );
    });

    it('draws every bound tile with its library chart when the types are installed', () => {
        const { charts: swapped, rejected } = withLibraryCharts(
            charts,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        expect(rejected).toEqual([]);
        swapped.forEach((chart) => {
            const binding = analyticsLibraryChartBindings.get(chart.slug);
            expect(
                chart.chartConfig.type === ChartType.DATA_APP_VIZ
                    ? chart.chartConfig.config?.dataAppVizSlug
                    : null,
            ).toBe(binding?.slug ?? null);
        });
    });

    it('falls back to the plain chart on a version older than a binding needs', () => {
        const { charts: swapped, rejected } = withLibraryCharts(
            charts,
            analyticsLibraryChartBindings,
            installedTypes('0.0.1'),
        );
        expect(rejected.map(({ chartSlug }) => chartSlug)).toEqual(
            bound.map((chart) => chart.slug),
        );
        expect(swapped).toEqual(charts);
    });

    it('shows the latest day for a count of distinct things and the period total for a sum, in both versions', () => {
        const cards = bound.filter(
            (chart) =>
                analyticsLibraryChartBindings.get(chart.slug)!.slug ===
                'big-number-with-sparkline-trend',
        );
        cards.forEach((fallback) => {
            const { fieldMapping, optionValues, query } =
                analyticsLibraryChartBindings.get(fallback.slug)!;
            const metric = String(fieldMapping.value);
            const day = String(fieldMapping.time);
            expect(fallback.chartConfig.type).toBe(ChartType.BIG_NUMBER);
            expect(fallback.metricQuery.metrics).toEqual([metric]);
            expect(query?.dimensions).toEqual([day]);
            expect(query?.sorts).toEqual([{ fieldId: day, descending: false }]);
            expect(optionValues).toMatchObject({
                showSparklineArea: true,
                colorSparklineByTrend: false,
                showLabel: true,
            });
            if (
                metricTypes.get(metric) === 'sum' ||
                metricTypes.get(metric) === 'count'
            ) {
                // No day in the query: one row holding the total
                expect(fallback.metricQuery.dimensions).toEqual([]);
                expect(optionValues).toMatchObject({
                    valueAggregation: 'sum',
                    style: 'compact',
                    comparisonSource: 'previousPeriod',
                });
                expect(optionValues.label).not.toBe('Latest day');
            } else {
                // One row, newest day first: the big number shows the first row
                expect(fallback.metricQuery.dimensions).toEqual([day]);
                expect(fallback.metricQuery.limit).toBe(1);
                expect(sqlOf(fallback)).toMatch(
                    new RegExp(`ORDER BY "${day}" DESC\\s+LIMIT 1\\s*$`),
                );
                expect(optionValues).toMatchObject({
                    valueAggregation: 'latest',
                    label: 'Latest day',
                    showComparison: false,
                });
                expect(fallback.description).toContain('on the latest day');
            }
        });
        // At most one wide card marks its highest and lowest day
        const heroes = cards.filter(
            (chart) =>
                analyticsLibraryChartBindings.get(chart.slug)!.optionValues
                    .showHighLow === true,
        );
        expect(heroes.length).toBeLessThanOrEqual(1);
        heroes.forEach((hero) =>
            chartTiles
                .filter((tile) => slugOf(tile) === hero.slug)
                .forEach((tile) => expect(tile.w).toBeGreaterThanOrEqual(18)),
        );
    });

    it('never ranks categories by a count of distinct things', () => {
        charts
            .filter(({ metricQuery }) =>
                metricQuery.tableCalculations.some(
                    ({ name }) => name === topCategoryRank,
                ),
            )
            .forEach(({ metricQuery }) => {
                expect(['sum', 'count']).toContain(
                    metricTypes.get(metricQuery.metrics[0]),
                );
            });
    });

    it('sorts every ranking by its first measure, in the query and in the table', () => {
        bound
            .filter(
                (chart) =>
                    analyticsLibraryChartBindings.get(chart.slug)!.slug ===
                    'sortable-pivot-table',
            )
            .forEach((chart) => {
                const { optionValues, fieldMapping, query } =
                    analyticsLibraryChartBindings.get(chart.slug)!;
                const [first] = fieldMapping.metric as string[];
                expect(optionValues).toMatchObject({
                    initialSort: 'firstValue',
                    density: 'compact',
                    showMiniBars: true,
                });
                expect(query?.sorts).toEqual([
                    { fieldId: first, descending: true },
                ]);
                if (fieldMapping.rowDimension2)
                    expect(optionValues.defaultCollapsed).toBe('collapsed');
                // Plain headers: one name for the row header and one for each measure
                expect(String(optionValues.rowHeaderName)).toMatch(
                    fieldMapping.rowDimension2
                        ? /^[A-Z][^/_]+ \/ [A-Z][^/_]+$/
                        : /^[A-Z][^/_]+$/,
                );
                const names = String(optionValues.valueNames).split(',');
                expect(names).toHaveLength(
                    (fieldMapping.metric as string[]).length,
                );
                names.forEach((name) => expect(name).toMatch(/^[A-Z][^_]+$/));
            });
    });

    it('writes titles and descriptions in the agreed words', () => {
        const copy = charts.flatMap((chart) => [
            chart.name,
            chart.description,
            analyticsLibraryChartBindings.get(chart.slug)?.query?.description ??
                '',
            ...Object.values(
                analyticsLibraryChartBindings.get(chart.slug)?.optionValues ??
                    {},
            ).filter((value): value is string => typeof value === 'string'),
        ]);
        const banned =
            /\b(observed|captured|retained|coverage|logical|Ask AI)\b|—/i;
        bound.forEach((chart) => {
            expect(chart.name).not.toMatch(banned);
            expect(chart.name).not.toMatch(/\.$/);
        });
        expect(
            copy
                .filter((text): text is string => !!text && banned.test(text))
                // Existing descriptions of charts this redesign did not touch
                .filter((text) => !untouchedCopy.includes(text)),
        ).toEqual([]);
    });
});

describe('lightdash-analytics-ai-tokens', () => {
    const slug = 'lightdash-analytics-ai-tokens';
    const { dashboard, charts } = analyticsContentAsCode.find(
        (bundle) => bundle.dashboard.slug === slug,
    )!;
    const numbers = [
        'total',
        'eligible',
        'records',
        'input',
        'output',
        'cache-read',
        'cache-write',
        'reasoning',
    ].map((key) => `${slug}-${key}`);

    it('binds the eight number tiles and nothing else', () => {
        expect(
            charts
                .filter((chart) =>
                    analyticsLibraryChartBindings.has(chart.slug),
                )
                .map((chart) => chart.slug),
        ).toEqual(numbers);
        numbers.forEach((chartSlug) => {
            const chart = charts.find((item) => item.slug === chartSlug)!;
            const binding = analyticsLibraryChartBindings.get(chartSlug)!;
            expect(chart.chartConfig.type).toBe(ChartType.BIG_NUMBER);
            // Every metric here is a sum or a count, so the month's total is safe
            expect(['sum', 'count']).toContain(
                metricTypes.get(String(binding.fieldMapping.value)),
            );
            expect(chart.metricQuery.dimensions).toEqual([]);
            expect(binding.optionValues).toMatchObject({
                valueAggregation: 'sum',
                label: 'This month',
                showComparison: false,
                showSparklineArea: true,
            });
            expect(binding.query).toMatchObject({
                dimensions: ['ai_usage_event_ts_day'],
                metrics: chart.metricQuery.metrics,
                description: chart.description,
            });
        });
    });

    it('draws plain charts without the library types and cards with them, on the same month', () => {
        const plain = withLibraryCharts(
            charts,
            analyticsLibraryChartBindings,
            new Map(),
        );
        expect(plain.rejected).toEqual([]);
        expect(plain.charts).toEqual(charts);
        const { charts: swapped, rejected } = withLibraryCharts(
            charts,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        expect(rejected).toEqual([]);
        swapped.forEach((chart, index) => {
            expect(chart.chartConfig.type === ChartType.DATA_APP_VIZ).toBe(
                numbers.includes(chart.slug),
            );
            // The month and the billing scope are filters, and the card keeps them
            expect(chart.metricQuery.filters).toEqual(
                charts[index].metricQuery.filters,
            );
        });
    });

    it('keeps its rows inside the 36-column grid with at most eight chart tiles on a tab', () => {
        dashboard.tabs.forEach((tab) => {
            const tiles = dashboard.tiles.filter(
                (tile) => tile.tabSlug === tab.slug,
            );
            const rows = new Map<number, number>();
            tiles.forEach((tile) =>
                rows.set(tile.y, (rows.get(tile.y) ?? 0) + tile.w),
            );
            rows.forEach((width) => expect(width).toBe(36));
            expect(
                tiles.filter(
                    (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                ).length,
            ).toBeLessThanOrEqual(8);
        });
    });
});

describe('Agents & AI feedback table', () => {
    const all = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
    const feedbackSlug =
        'lightdash-analytics-overview-agent-feedback-rating-and-sample-coverage';
    const draw = (types: Map<string, UsableLibraryChartType>) => {
        const { charts: drawn, rejected } = withLibraryCharts(
            all,
            analyticsLibraryChartBindings,
            types,
        );
        return {
            rejected,
            feedback: drawn.find((chart) => chart.slug === feedbackSlug)!,
        };
    };

    it('draws a plain table when the library type is missing', () => {
        const { feedback, rejected } = draw(new Map());
        expect(rejected).toEqual([]);
        expect(feedback.chartConfig.type).toBe(ChartType.TABLE);
    });

    it('draws the ranked table when the library type is installed', () => {
        const { feedback, rejected } = draw(installedTypes());
        expect(rejected).toEqual([]);
        expect(feedback.chartConfig).toMatchObject({
            type: ChartType.DATA_APP_VIZ,
            config: { dataAppVizSlug: 'sortable-pivot-table' },
        });
        // The table keeps the counts, which are table calculations of the shared query
        expect(
            feedback.metricQuery.tableCalculations.map(({ name }) => name),
        ).toEqual([
            'rated_requests',
            'share_rated_percent',
            'negative_ratings',
        ]);
    });

    it('falls back to the plain table on an older library type', () => {
        const { feedback, rejected } = draw(installedTypes('0.0.1'));
        expect(rejected.map(({ chartSlug }) => chartSlug)).toContain(
            feedbackSlug,
        );
        expect(feedback.chartConfig.type).toBe(ChartType.TABLE);
    });
});

describe('Agents & AI failed-request card', () => {
    const all = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
    const failedSlug =
        'lightdash-analytics-overview-request-consumption-by-outcome-and-feedback';
    const draw = (types: Map<string, UsableLibraryChartType>) => {
        const { charts: drawn, rejected } = withLibraryCharts(
            all,
            analyticsLibraryChartBindings,
            types,
        );
        return {
            rejected,
            failed: drawn.find((chart) => chart.slug === failedSlug)!,
        };
    };

    it('draws a plain big number when the library type is missing', () => {
        const { failed, rejected } = draw(new Map());
        expect(rejected).toEqual([]);
        expect(failed.chartConfig.type).toBe(ChartType.BIG_NUMBER);
        expect(failed.metricQuery.dimensions).toEqual([]);
    });

    it('draws the card with one point per day when the library type is installed', () => {
        const { failed, rejected } = draw(installedTypes());
        expect(rejected).toEqual([]);
        expect(failed.chartConfig).toMatchObject({
            type: ChartType.DATA_APP_VIZ,
            config: { dataAppVizSlug: 'big-number-with-sparkline-trend' },
        });
        expect(failed.metricQuery.dimensions).toEqual([
            'agent_requests_requested_at_day',
        ]);
        // The card measures the same failed and cancelled requests as the plain number
        expect(failed.metricQuery.metrics).toContain(
            all.find((chart) => chart.slug === failedSlug)!.metricQuery
                .metrics[0],
        );
        expect(sqlOf(failed)).toContain("IN ('error','cancelled')");
        // Their share of all tokens is worked out over the whole period, not one day
        expect(failed.metricQuery.tableCalculations).toMatchObject([
            { name: 'failed_token_share' },
        ]);
        expect(sqlOf(failed)).toContain('failed_token_share');
    });

    it('falls back to the plain big number on an older library type', () => {
        const { failed, rejected } = draw(installedTypes('0.0.1'));
        expect(rejected.map(({ chartSlug }) => chartSlug)).toContain(
            failedSlug,
        );
        expect(failed.chartConfig.type).toBe(ChartType.BIG_NUMBER);
    });

    it('gives every day the share of the whole period, from real rows', async () => {
        const { failed } = draw(installedTypes());
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
            await db.run(
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR)',
            );
            await db.run(
                'CREATE TABLE lightdash_agents (org_id VARCHAR, agent_id VARCHAR, name VARCHAR)',
            );
            // Day one: a failed request (30 tokens) and a cancelled one (10). Day two: a success (60).
            await db.run(`INSERT INTO agent_request_events
                (org_id, project_id, user_id, agent_id, thread_id, prompt_id, event_id, event_ts, stage, outcome) VALUES
                ('org','project','u','a','t','p1','c1','2026-01-05 10:00:00','created',NULL),
                ('org','project','u','a','t','p1','o1','2026-01-05 10:00:01','outcome','error'),
                ('org','project','u','a','t','p2','c2','2026-01-05 11:00:00','created',NULL),
                ('org','project','u','a','t','p2','o2','2026-01-05 11:00:01','interrupted',NULL),
                ('org','project','u','a','t','p3','c3','2026-01-06 10:00:00','created',NULL),
                ('org','project','u','a','t','p3','o3','2026-01-06 10:00:01','outcome','success')`);
            await db.run(`INSERT INTO ai_usage
                (org_id, project_id, agent_id, prompt_id, event_id, event_ts, total_tokens) VALUES
                ('org','project','a','p1','k1','2026-01-05 10:00:01',30),
                ('org','project','a','p2','k2','2026-01-05 11:00:01',10),
                ('org','project','a','p3','k3','2026-01-06 10:00:01',60)`);
            const rows = (
                await db.runAndReadAll(sqlOf(failed))
            ).getRowObjectsJS();
            expect(
                rows.map((row) => [
                    Number(
                        row.agent_requests_failed_or_cancelled_request_tokens ??
                            0,
                    ),
                    Number(row.agent_requests_total_request_tokens),
                    Number(row.failed_token_share),
                ]),
            ).toEqual([
                [40, 40, 0.4],
                [0, 60, 0.4],
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('library chart options', () => {
    const entries = [...analyticsLibraryChartBindings.entries()];

    it('sets only options its chart type accepts', () => {
        entries.forEach(([, binding]) =>
            expect(Object.keys(libraryChartOptions[binding.slug])).toEqual(
                expect.arrayContaining(Object.keys(binding.optionValues)),
            ),
        );
    });

    it('asks for a version that has every option it sets, and no newer', () => {
        entries.forEach(([slug, binding]) => {
            const needed = Object.keys(binding.optionValues)
                .map((name) => libraryChartOptions[binding.slug][name])
                .filter((version): version is string => version !== null)
                .sort(compareSemverVersions)
                .at(-1);
            if (needed)
                expect([slug, binding.minVersion]).toEqual([slug, needed]);
            else
                expect(
                    Object.values(libraryChartOptions[binding.slug]).some(
                        (version) =>
                            version !== null &&
                            compareSemverVersions(
                                binding.minVersion,
                                version,
                            ) >= 0,
                    ),
                ).toBe(false);
        });
    });
});

describe('axis titles of the area charts', () => {
    // The trellis has no title options: it titles its axes with the labels of the fields it draws
    it.each([
        ['lightdash-analytics-home-people-by-day', 'Day', 'People'],
        ['lightdash-analytics-home-queries-by-day', 'Day', 'Queries'],
        [
            'lightdash-analytics-home-agent-requests-by-day',
            'Day',
            'Agent requests',
        ],
        [
            'lightdash-analytics-query-activity-active-users-by-day',
            'Day',
            'People',
        ],
    ])('%s reads %s and %s', (slug, xTitle, yTitle) => {
        const binding = analyticsLibraryChartBindings.get(slug)!;
        expect(binding.slug).toBe('vega-trellis');
        const labels = new Map(
            explores.flatMap((explore) =>
                Object.values(explore.tables).flatMap((table) =>
                    [
                        ...Object.values(table.dimensions),
                        ...Object.values(table.metrics),
                    ].map((field) => [
                        `${table.name}_${field.name}`,
                        field.label,
                    ]),
                ),
            ),
        );
        expect(labels.get(binding.fieldMapping.x as string)).toBe(xTitle);
        expect(labels.get(binding.fieldMapping.value as string)).toBe(yTitle);
    });
});

describe('top categories', () => {
    it('keeps the categories with the largest totals, whatever the day', async () => {
        const chart = analyticsContentAsCode
            .flatMap((bundle) => bundle.charts)
            .find(
                ({ slug }) =>
                    slug ===
                    'lightdash-analytics-adoption-adoption-activity-by-person-and-day',
            )!;
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            const { userActivityColumns } =
                await import('../eventStream/userActivity');
            await db.run(
                `CREATE TABLE user_activity (${userActivityColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR)',
            );
            // Twenty people; person n has n activities on each of two days
            for (let n = 1; n <= 20; n += 1) {
                await db.run(
                    `INSERT INTO lightdash_users VALUES ('org','u${n}','Person ${n}',NULL)`,
                );
                await db.run(`INSERT INTO user_activity (org_id,project_id,user_id,activity_date,event_count,stream) VALUES
                    ('org','project','u${n}',CURRENT_DATE - 3,${n},'query_events'),
                    ('org','project','u${n}',CURRENT_DATE - 2,${n},'query_events')`);
            }
            const rows = (
                await db.runAndReadAll(sqlOf(chart))
            ).getRowObjectsJS();
            expect(rows).toHaveLength(30);
            expect(
                [...new Set(rows.map((row) => row.user_activity_user_id))]
                    .map((id) => Number(String(id).slice(1)))
                    .sort((a, b) => a - b),
            ).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
        expect(compactedStreamSchemas).toBeDefined();
    });
});
