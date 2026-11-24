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
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { compileMetricQuery } from '../../queryCompiler';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import { MetricQueryBuilder } from '../../utils/QueryBuilder/MetricQueryBuilder';
import { compactedStreamSchemas } from '../eventStream/registry';
import {
    libraryChartFields,
    libraryChartFloors,
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
                'big-number-with-sparkline-trend',
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
                'content-with-activity',
                0,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'content-without-activity-in-use',
                12,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'content-without-activity',
                24,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'review-candidates-activity-and-known-dependencies',
                0,
                5,
                36,
                7,
                'sortable-pivot-table',
                'table',
            ],
        ],
        ownership: [
            [
                'content-ownership-current-snapshot',
                0,
                1,
                36,
                4,
                'customizable-cartesian-chart',
                'pie',
            ],
            [
                'content-owners-needing-review',
                0,
                5,
                36,
                6,
                'sortable-pivot-table',
                'table',
            ],
            [
                'high-compute-dashboards-audience-versus-warehouse-time',
                0,
                12,
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
            ['top-apps', 0, 20, 36, 6, 'sortable-pivot-table', 'table'],
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
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-people-downloading-latest-day',
                12,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-csv-downloads',
                24,
                1,
                12,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'tools-downloads-by-format-and-day',
                0,
                5,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'export-audit-actor-content-and-outcome',
                0,
                12,
                36,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'tools-google-sheets-queries-by-day',
                0,
                21,
                36,
                5,
                'vega-trellis',
                'cartesian',
            ],
            [
                'tools-google-sheets-queries-by-person',
                0,
                26,
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
                5,
                'sortable-pivot-table',
                'table',
            ],
            ['recent-evaluation-runs', 0, 19, 36, 7, null, 'table'],
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
                'big-number-with-sparkline-trend',
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
                18,
                6,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'adoption-app-creators',
                18,
                1,
                18,
                6,
                'sortable-pivot-table',
                'table',
            ],
            [
                'adoption-app-reader-trend',
                0,
                8,
                36,
                8,
                'vega-trellis',
                'cartesian',
            ],
            [
                'adoption-app-reader-detail',
                0,
                16,
                18,
                8,
                'sortable-pivot-table',
                'table',
            ],
            [
                'adoption-app-first-audience',
                18,
                16,
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
                1,
                36,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            ['adoption-app-outcome-detail', 0, 8, 36, 7, null, 'table'],
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
            [
                'embed-popular-dashboards',
                0,
                12,
                18,
                8,
                'customizable-cartesian-chart',
                'custom',
            ],
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
                1,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            [
                'embed-query-errors',
                18,
                1,
                18,
                4,
                'big-number-with-sparkline-trend',
                'big_number',
            ],
            ['embed-query-trend', 0, 6, 18, 7, 'vega-trellis', 'cartesian'],
            [
                'embed-query-latency',
                18,
                6,
                18,
                7,
                'customizable-cartesian-chart',
                'cartesian',
            ],
            [
                'embed-query-outcomes',
                0,
                14,
                18,
                7,
                'customizable-cartesian-chart',
                'pie',
            ],
            [
                'embed-query-cache',
                18,
                14,
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
        // A card with a trend behind it. A lone number with no daily series has no day to map.
        const cards = bound.filter((chart) => {
            const binding = analyticsLibraryChartBindings.get(chart.slug)!;
            return (
                binding.slug === 'big-number-with-sparkline-trend' &&
                binding.fieldMapping.time !== undefined
            );
        });
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
                    // A badge could only compare one day with the day before, not the period
                    showComparison: false,
                });
                expect(optionValues).not.toHaveProperty('comparisonSource');
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
                // A table grouped by two names takes whole groups first, largest group first
                expect(query?.sorts.at(-1)).toEqual({
                    fieldId: first,
                    descending: true,
                });
                expect(query?.sorts.slice(0, -1)).toEqual(
                    query?.tableCalculations?.some(
                        ({ name }) => name === 'group_total',
                    )
                        ? [
                              { fieldId: 'group_total', descending: true },
                              {
                                  fieldId: fieldMapping.rowDimension,
                                  descending: false,
                              },
                          ]
                        : [],
                );
                // Collapsed, except a short list that is the point of its tile
                if (fieldMapping.rowDimension2)
                    expect(['collapsed', 'expanded']).toContain(
                        optionValues.defaultCollapsed,
                    );
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
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR, is_active BOOLEAN)',
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
            // The newest option it sets, or the version with a fix every binding of the type needs
            const needed = [
                ...Object.keys(binding.optionValues).map(
                    (name) => libraryChartOptions[binding.slug][name],
                ),
                libraryChartFloors[binding.slug] ?? null,
            ]
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

describe('Tokens by feature and model', () => {
    it('lists models provider by provider, the provider and the model with the most tokens first', async () => {
        const all = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
        const { charts: drawn } = withLibraryCharts(
            all,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        const heatmap = drawn.find(({ slug }) =>
            slug.endsWith('-ai-tokens-by-feature-and-model'),
        )!;
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            await db.run(
                `CREATE TABLE ai_usage (${compactedStreamSchemas.ai_usage.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(`INSERT INTO ai_usage (org_id, event_id, event_ts, feature, model, provider, total_tokens) VALUES
                ('org','1',CURRENT_TIMESTAMP,'agent','gpt-small','openai',10),
                ('org','2',CURRENT_TIMESTAMP,'agent','gpt-big','openai',50),
                ('org','3',CURRENT_TIMESTAMP,'agent','claude-a','anthropic',40),
                ('org','4',CURRENT_TIMESTAMP,'data-app','us.anthropic.claude-b','bedrock',70),
                ('org','5',CURRENT_TIMESTAMP,'agent','gemini-x','google',5),
                ('org','6',CURRENT_TIMESTAMP,'agent','my-deployment','azure',3)`);
            const rows = (
                await db.runAndReadAll(sqlOf(heatmap))
            ).getRowObjectsJS();
            // The heatmap keeps its columns in the order the rows arrive
            // Grouped by the provider in the model's name, so Claude through Bedrock sits with Anthropic
            expect([
                ...new Set(rows.map((row) => row.ai_usage_model_name)),
            ]).toEqual([
                'us.anthropic.claude-b',
                'claude-a',
                'gpt-big',
                'gpt-small',
                'gemini-x',
                'my-deployment',
            ]);
            expect([
                ...new Set(rows.map((row) => row.ai_usage_model_provider)),
            ]).toEqual(['Anthropic', 'OpenAI', 'Google', 'Other']);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('names of people who have left', () => {
    it('keeps a deactivated member by name, marked, and tells an unknown ID from no ID', async () => {
        const all = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
        const { charts: drawn } = withLibraryCharts(
            all,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        const slug = 'lightdash-analytics-home-most-active-people';
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            const { userActivityColumns } =
                await import('../eventStream/userActivity');
            const { usageDimensionSchemas } =
                await import('../eventStream/usageDimensions');
            await db.run(
                `CREATE TABLE user_activity (${userActivityColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                `CREATE TABLE lightdash_users (${usageDimensionSchemas.users.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(`INSERT INTO lightdash_users (org_id,user_id,name,email,is_active) VALUES
                ('org','active','Alex Active','alex@example.com',true),
                ('org','left','Dana Whitcombe','dana@example.com',false),
                ('org','old-snapshot','Sam Before','sam@example.com',NULL)`);
            await db.run(`INSERT INTO user_activity (org_id,project_id,user_id,activity_date,event_count,stream) VALUES
                ('org','project','active',CURRENT_DATE - 2,5,'query_events'),
                ('org','project','left',CURRENT_DATE - 2,4,'query_events'),
                ('org','project','old-snapshot',CURRENT_DATE - 2,3,'query_events'),
                ('org','project','not-a-member',CURRENT_DATE - 2,2,'query_events'),
                ('org','project',NULL,CURRENT_DATE - 2,1,'query_events')`);
            // The ranked table as the library chart reads it: one row per name
            const ranked = (
                await db.runAndReadAll(
                    sqlOf(drawn.find((chart) => chart.slug === slug)!),
                )
            ).getRowObjectsJS();
            expect(
                ranked.map((row) => [
                    row.user_activity_user_name,
                    Number(row.user_activity_total_events),
                ]),
            ).toEqual([
                ['Alex Active', 5],
                ['Dana Whitcombe (deactivated)', 4],
                // A snapshot written before the column existed says nothing either way
                ['Sam Before', 3],
                ['Unknown user', 2],
                // Activity with no person recorded is not ranked as a person
            ]);
            // The plain table shows the same names in its person column
            const plain = (
                await db.runAndReadAll(
                    sqlOf(all.find((chart) => chart.slug === slug)!),
                )
            ).getRowObjectsJS();
            expect(
                plain.map((row) => [
                    row.user_activity_user_id,
                    row.user_display_name,
                ]),
            ).toEqual([
                ['active', 'Alex Active'],
                ['left', 'Dana Whitcombe (deactivated)'],
                ['old-snapshot', 'Sam Before'],
                ['not-a-member', 'User not-a-member'],
            ]);
            // A count of people is a count: no marker, nobody dropped
            const card = all.find(
                (chart) =>
                    chart.slug === 'lightdash-analytics-home-active-people',
            )!;
            const [latest] = (
                await db.runAndReadAll(sqlOf(card))
            ).getRowObjectsJS();
            expect(Number(latest.user_activity_unique_users)).toBe(4);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('who ran a query, by the kind of actor recorded', () => {
    it('names service accounts, embedded viewers and anonymous use, and keeps Unknown user for an unmatched person', async () => {
        const chart = {
            ...analyticsContentAsCode
                .flatMap((bundle) => bundle.charts)
                .find(({ slug }) =>
                    slug.endsWith('-tools-google-sheets-queries-by-person'),
                )!,
        };
        // The same person table, over every query instead of only Google Sheets ones
        chart.metricQuery = { ...chart.metricQuery, filters: {}, limit: 500 };
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            const { usageDimensionSchemas } =
                await import('../eventStream/usageDimensions');
            await db.run(
                `CREATE TABLE query_events (${compactedStreamSchemas.query_events.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                `CREATE TABLE lightdash_users (${usageDimensionSchemas.users.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(`INSERT INTO lightdash_users (org_id,user_id,name,is_active) VALUES
                ('org','member','Alex Active',true),
                ('org','left','Dana Whitcombe',false),
                ('org','named-account','Reporting bot',true)`);
            const row = (
                id: string,
                user: string | null,
                actor: string | null,
                context: string,
                externalUser: string | null = null,
            ) =>
                `('org','${id}',${user ? `'${user}'` : 'NULL'},${actor ? `'${actor}'` : 'NULL'},'${context}',${externalUser ? `'${externalUser}'` : 'NULL'},CURRENT_TIMESTAMP,'success')`;
            await db.run(`INSERT INTO query_events (org_id,query_id,user_id,initiating_actor_type,context,external_user_id,event_ts,status) VALUES
                ${[
                    row('1', 'member', 'registered_user', 'dashboardView'),
                    row('2', 'left', 'registered_user', 'dashboardView'),
                    row('3', 'gone', 'registered_user', 'dashboardView'),
                    row('4', 'abcdef12-3456', 'service_account', 'api'),
                    row('5', 'named-account', 'service_account', 'api'),
                    row('6', null, 'anonymous', 'embed', 'viewer-9'),
                    row('7', null, 'anonymous', 'api'),
                    // Older rows with no actor type recorded
                    row('8', null, null, 'embed'),
                    row('9', null, null, 'dashboardView'),
                    row('10', 'member', null, 'dashboardView'),
                ].join(',')}`);
            const rows = (
                await db.runAndReadAll(sqlOf(chart))
            ).getRowObjectsJS();
            expect(
                rows
                    .map((line) => [
                        line.user_display_name,
                        Number(line.query_events_total_queries),
                    ])
                    .sort(),
            ).toEqual(
                [
                    ['Alex Active', 2],
                    ['Dana Whitcombe (deactivated)', 1],
                    // A signed-in person whose ID matches no member: the only Unknown user. The plain
                    // table shows the ID so two of them stay apart.
                    ['User gone', 1],
                    ['Service account abcdef12', 1],
                    ['Service account Reporting bot', 1],
                    ['Embedded viewer', 2],
                    ['Anonymous', 1],
                    ['No user recorded', 1],
                ].sort(),
            );
            expect(
                rows.find((line) => line.query_events_user_id === 'gone')!
                    .query_events_user_name,
            ).toBe('Unknown user');
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('MCP tool calls by person and tool', () => {
    it('lists each service account by itself, not together under Unknown user', async () => {
        const chart = analyticsContentAsCode
            .flatMap((bundle) => bundle.charts)
            .find(({ slug }) =>
                slug.endsWith('-mcp-users-clients-tools-and-error-rates'),
            )!;
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            for (const stream of ['mcp_tool_calls', 'agent_steps'] as const) {
                await db.run(
                    `CREATE TABLE ${stream} (${compactedStreamSchemas[stream].map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
                );
            }
            await db.run(
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR, is_active BOOLEAN)',
            );
            await db.run(
                'CREATE TABLE lightdash_agents (org_id VARCHAR, agent_id VARCHAR, name VARCHAR)',
            );
            await db.run(
                "INSERT INTO lightdash_users (org_id,user_id,name) VALUES ('org','person-1','Alex')",
            );
            await db.run(`INSERT INTO mcp_tool_calls (org_id, user_id, actor_id, actor_type, tool_name, tool_call_id, status, event_ts) VALUES
                ('org','person-1','person-1','user','run_sql','1','success',CURRENT_TIMESTAMP),
                ('org',NULL,'aaaaaaaa-1111','service_account','run_sql','2','success',CURRENT_TIMESTAMP),
                ('org',NULL,'aaaaaaaa-1111','service_account','run_sql','3','error',CURRENT_TIMESTAMP),
                ('org',NULL,'bbbbbbbb-2222','service_account','run_sql','4','success',CURRENT_TIMESTAMP)`);
            const rows = (
                await db.runAndReadAll(sqlOf(chart))
            ).getRowObjectsJS();
            expect(
                rows
                    .map((row) => [
                        row.tool_activity_actor_name,
                        Number(row.tool_activity_total_calls),
                    ])
                    .sort(),
            ).toEqual([
                ['Alex', 1],
                ['Service account aaaaaaaa', 2],
                ['Service account bbbbbbbb', 1],
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('new content adoption', () => {
    it('counts first-week viewers and who came back, and leaves it blank for content under a week old', async () => {
        const chart = analyticsContentAsCode
            .flatMap((bundle) => bundle.charts)
            .find(({ slug }) =>
                slug.endsWith('-new-content-adoption-creation-week-proxy'),
            )!;
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            await db.run(
                `CREATE TABLE content_views (${compactedStreamSchemas.content_views.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            const { contentInventoryColumns } =
                await import('../eventStream/contentInventory');
            await db.run(
                `CREATE TABLE lightdash_content (${contentInventoryColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            // The inventory is where an item's creation date comes from. A view event carries a date of
            // its own, which can differ: here every event claims the item was created the day it was
            // first viewed.
            const item = (content: string, createdDaysAgo: number) =>
                `('org','project','dashboard','${content}','${content}',CURRENT_DATE - INTERVAL ${createdDaysAgo} DAY)`;
            await db.run(`INSERT INTO lightdash_content (org_id,project_id,content_type,content_id,content_name,created_at) VALUES
                ${[item('old', 20), item('new', 3), item('ancient', 400), item('misdated', 30)].join(',')}`);
            const view = (
                content: string,
                eventSaysCreatedDaysAgo: number,
                user: string,
                viewedDaysAgo: number,
            ) =>
                `('org','project','dashboard','${content}','${content}','${user}','user',true,CURRENT_DATE - INTERVAL ${eventSaysCreatedDaysAgo} DAY,CURRENT_DATE - INTERVAL ${viewedDaysAgo} DAY + INTERVAL 1 HOUR,'${content}-${user}-${viewedDaysAgo}')`;
            await db.run(`INSERT INTO content_views (org_id,project_id,content_type,content_id,content_name,user_id,actor_type,is_qualifying,content_created_at,event_ts,event_id) VALUES
                ${[
                    // Twenty days old: a and b viewed it in the first week, only a came back
                    view('old', 20, 'a', 19),
                    view('old', 20, 'b', 18),
                    view('old', 20, 'a', 5),
                    // c first saw it after the first week, so is neither
                    view('old', 20, 'c', 4),
                    // Three days old: its first week is still running
                    view('new', 3, 'a', 2),
                    // Created long before anything was recorded
                    view('ancient', 400, 'a', 6),
                    // Thirty days old in the inventory, but its events say it was created ten days ago,
                    // when it was first viewed. By the inventory nobody saw it in its first week.
                    view('misdated', 10, 'a', 10),
                    view('misdated', 10, 'a', 2),
                ].join(',')}`);
            const rows = (
                await db.runAndReadAll(sqlOf(chart))
            ).getRowObjectsJS();
            const day = (value: unknown) =>
                new Date(value as Date).toISOString().slice(0, 10);
            const daysAgo = (days: number) =>
                new Date(Date.now() - days * 86400000)
                    .toISOString()
                    .slice(0, 10);
            expect(
                rows.map((row) => [
                    row.content_reach_content_name,
                    Number(row.content_reach_new_content_first_week_viewers),
                    row.came_back_later === null
                        ? null
                        : Number(row.came_back_later),
                    row.came_back_share === null
                        ? null
                        : Math.round(100 * Number(row.came_back_share)),
                ]),
            ).toEqual(
                expect.arrayContaining([
                    ['old', 2, 1, 50],
                    ['new', 1, null, null],
                    ['ancient', 0, 0, null],
                    ['misdated', 0, 0, null],
                ]),
            );
            expect(rows).toHaveLength(4);
            expect(rows[0].content_reach_content_name).toBe('old');
            // The Created column is the inventory's date, not the one on the events
            expect(
                day(
                    rows.find(
                        (row) => row.content_reach_content_name === 'misdated',
                    )!.content_reach_created_at_day,
                ),
            ).toBe(daysAgo(30));
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('hover descriptions', () => {
    const sentencesOf = (text: string) =>
        text.split(/[.?!](?:\s+|$)/).filter((sentence) => sentence.trim())
            .length;

    it('say what a tile shows in at most two sentences, in the plain and the library version', () => {
        const long = analyticsContentAsCode.flatMap(({ dashboard, charts }) => {
            const tiled = new Set(
                dashboard.tiles.flatMap((tile) =>
                    'chartSlug' in tile.properties
                        ? [tile.properties.chartSlug]
                        : [],
                ),
            );
            return charts
                .filter(({ slug }) => tiled.has(slug))
                .flatMap(({ slug, description }) =>
                    [
                        description ?? '',
                        analyticsLibraryChartBindings.get(slug)?.query
                            ?.description ?? '',
                    ]
                        .filter((text) => sentencesOf(text) > 2)
                        .map((text) => `${slug}: ${text}`),
                );
        });
        expect(long).toEqual([]);
    });
});

describe('field labels a library chart can show', () => {
    // A library chart titles its axes, legends and columns with the label of each field it draws
    it('are plain words, with no column-style names', () => {
        const labels = new Map(
            explores.flatMap((explore) =>
                Object.values(explore.tables).flatMap((table) =>
                    [
                        ...Object.values(table.dimensions),
                        ...Object.values(table.metrics),
                    ].map((field) => [
                        `${explore.name}|${table.name}_${field.name}`,
                        field.label,
                    ]),
                ),
            ),
        );
        const shown = analyticsContentAsCode.flatMap(({ charts }) =>
            charts.flatMap((chart) =>
                Object.values(
                    analyticsLibraryChartBindings.get(chart.slug)
                        ?.fieldMapping ?? {},
                )
                    .flat()
                    .flatMap((field) => {
                        const label = labels.get(`${chart.tableName}|${field}`);
                        return label ? [label] : [];
                    }),
            ),
        );
        expect(shown.length).toBeGreaterThan(100);
        expect(
            [...new Set(shown)].filter((label) =>
                /\b(ts|at|Total|Unique|Distinct|Qualifying|Observed|coverage|count|name|label|User|Users)\b| name$/i.test(
                    label,
                ),
            ),
        ).toEqual([]);
        expect(labels.get('ai_usage|ai_usage_feature_name')).toBe('Feature');
        expect(labels.get('ai_usage|ai_usage_feature')).toBe(
            'Feature (recorded value)',
        );
        expect(labels.get('query_events|query_events_event_ts_day')).toBe(
            'Day',
        );
        expect(
            labels.get('query_events|query_events_p95_response_time_s'),
        ).toBe('P95 response time (seconds)');
    });
});

describe('axis titles of the area charts', () => {
    // The trellis has no title options: it titles its axes with the labels of the fields it draws
    it.each([
        ['lightdash-analytics-home-people-by-day', 'Day', 'People'],
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
                'CREATE TABLE lightdash_users (org_id VARCHAR, user_id VARCHAR, name VARCHAR, email VARCHAR, is_active BOOLEAN)',
            );
            // Twenty people; person n has n activities on each of two days
            for (let n = 1; n <= 20; n += 1) {
                await db.run(
                    `INSERT INTO lightdash_users (org_id,user_id,name) VALUES ('org','u${n}','Person ${n}')`,
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

describe('totals of a table grouped by two names', () => {
    it('asks for whole groups, largest first, so a short row limit never leaves a group short', async () => {
        const all = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
        const { charts: drawn } = withLibraryCharts(
            all,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        const chart = drawn.find(
            ({ slug }) =>
                slug ===
                'lightdash-analytics-adoption-adoption-app-reader-detail',
        )!;
        expect(chart.metricQuery.sorts.map(({ fieldId }) => fieldId)).toEqual([
            'group_total',
            'data_app_reach_app_name',
            'data_app_reach_total_loads',
        ]);
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            const { usageDimensionSchemas } =
                await import('../eventStream/usageDimensions');
            const { contentInventoryColumns } =
                await import('../eventStream/contentInventory');
            await db.run(
                `CREATE TABLE data_app_events (${compactedStreamSchemas.data_app_events.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                `CREATE TABLE lightdash_users (${usageDimensionSchemas.users.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            await db.run(
                `CREATE TABLE lightdash_content (${contentInventoryColumns.map(({ name, type }) => `"${name}" ${type}`).join(', ')})`,
            );
            // Small has one busy person; Big has four people with fewer loads each but more in all
            const loads: [string, string, number][] = [
                ['small', 'zed', 5],
                ['big', 'ann', 4],
                ['big', 'bob', 3],
                ['big', 'cat', 2],
                ['big', 'dan', 1],
            ];
            for (const [, person] of loads)
                await db.run(
                    `INSERT INTO lightdash_users (org_id,user_id,name) VALUES ('org','${person}','${person}')`,
                );
            for (const [app, person, count] of loads)
                for (let load = 0; load < count; load += 1)
                    await db.run(
                        `INSERT INTO data_app_events (org_id,project_id,app_id,user_id,event_name,view_context,event_ts)
                         VALUES ('org','project','${app}','${person}','data_app.view','standalone',CURRENT_TIMESTAMP)`,
                    );
            // Four rows fit: by loads alone that would be Small and three of Big's four people
            const rows = (
                await db.runAndReadAll(
                    sqlOf({
                        ...chart,
                        metricQuery: { ...chart.metricQuery, limit: 4 },
                    }),
                )
            ).getRowObjectsJS();
            expect(
                rows.map((row) => [
                    row.data_app_reach_app_name,
                    Number(row.data_app_reach_total_loads),
                ]),
            ).toEqual([
                ['big', 4],
                ['big', 3],
                ['big', 2],
                ['big', 1],
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
});

describe('options of the newest chart versions', () => {
    const optionsOf = (slug: string) =>
        analyticsLibraryChartBindings.get(slug)!.optionValues;

    it('draws passed green and failed orange, and counts runs in whole numbers', () => {
        expect(
            optionsOf(
                'lightdash-analytics-agent-evaluations-assessment-volume-by-day',
            ),
        ).toMatchObject({
            m1Color: '#34D399',
            m2Color: '#FB923C',
            yIntegerTicks: true,
        });
        expect(
            optionsOf(
                'lightdash-analytics-agent-evaluations-assessment-pass-rate-by-day',
            ),
        ).toMatchObject({ yIntegerTicks: true });
    });

    it('gives every card one number size and format, and every word cloud one colour', () => {
        const bindings = [...analyticsLibraryChartBindings.values()];
        const cards = bindings.filter(
            ({ slug, optionValues }) =>
                slug === 'big-number-with-sparkline-trend' &&
                'reserveComparisonSpace' in optionValues,
        );
        expect(cards.length).toBeGreaterThan(10);
        cards.forEach(({ optionValues }) =>
            expect(optionValues).toMatchObject({
                sizeMode: 'preset',
                bigNumberSize: 6,
                reserveComparisonSpace: false,
            }),
        );
        const clouds = bindings.filter(({ slug }) => slug === 'word-cloud');
        expect(clouds).toHaveLength(2);
        clouds.forEach(({ optionValues }) =>
            expect(optionValues).toMatchObject({
                colorMode: 'shade',
                rotationMode: 'none',
                showCaption: false,
            }),
        );
    });
});

describe('columns of plain tables', () => {
    const tables = analyticsContentAsCode
        .flatMap(({ charts }) => charts)
        .flatMap((chart) =>
            chart.chartConfig.type === ChartType.TABLE
                ? [{ chart, columns: chart.chartConfig.config?.columns ?? {} }]
                : [],
        );
    const shown = (
        chart: ChartAsCode,
        columns: Record<string, { visible?: boolean; name?: string }>,
    ) =>
        [
            ...chart.metricQuery.dimensions,
            ...chart.metricQuery.metrics,
            ...chart.metricQuery.tableCalculations.map(({ name }) => name),
        ].filter((field) => columns[field]?.visible !== false);

    const byKeyOfSpec = (key: string) =>
        tables.find(({ chart }) => chart.slug.endsWith(`-${key}`))!
            .columns as Record<string, { visible?: boolean }>;

    it('never show a field beside the plain-name field made from it', () => {
        expect(
            tables.flatMap(({ chart, columns }) => {
                const fields = shown(chart, columns);
                return fields
                    .filter((field) => fields.includes(`${field}_name`))
                    .map((field) => `${chart.slug}: ${field}`);
            }),
        ).toEqual([]);
    });

    it('never show two columns with the same header', () => {
        expect(
            tables.flatMap(({ chart, columns }) => {
                const headers = shown(chart, columns)
                    .map((field) => columns[field]?.name)
                    .filter((name): name is string => Boolean(name));
                return headers
                    .filter((name, index) => headers.indexOf(name) !== index)
                    .map((name) => `${chart.slug}: ${name}`);
            }),
        ).toEqual([]);
    });

    it('hide every ID and every column a chart asks to hide', () => {
        const run = byKeyOfSpec('recent-evaluation-runs');
        expect(run.agent_evaluation_runs_event_ts_raw).toMatchObject({
            visible: false,
        });
        const fieldUse = byKeyOfSpec('content-using-fields');
        [
            'semantic_usage_chart_name',
            'semantic_usage_dashboard_name',
            'semantic_usage_app_name',
            'semantic_usage_chart_id',
        ].forEach((field) =>
            expect(fieldUse[field]).toMatchObject({ visible: false }),
        );
        const lastUsed = byKeyOfSpec('people-without-activity-30d-detail');
        expect(
            lastUsed.people_adoption_last_observed_activity_at_day,
        ).toMatchObject({ visible: false });
    });
});

describe("Lightdash's own analytics content", () => {
    it('is filtered out of every tile about viewed content and out of Slow dashboards', () => {
        const charts = analyticsContentAsCode.flatMap(
            (bundle) => bundle.charts,
        );
        const reach = charts.filter(
            ({ tableName }) => tableName === 'content_reach',
        );
        expect(reach.length).toBeGreaterThan(5);
        [
            ...reach,
            charts.find(({ slug }) =>
                slug.endsWith('-slow-dashboards-tail-latency-and-demand'),
            )!,
        ].forEach((chart) =>
            expect(JSON.stringify(chart.metricQuery.filters)).toMatch(
                /"fieldId":"(content_reach|query_events)_in_analytics_project"\},"operator":"equals","values":\[false\]/,
            ),
        );
        // Counts of people and queries keep that activity: it is real use
        charts
            .filter(({ tableName }) => tableName === 'user_activity')
            .forEach((chart) =>
                expect(JSON.stringify(chart.metricQuery.filters)).not.toContain(
                    'in_analytics_project',
                ),
            );
    });
});

describe('SQL the query engine will accept', () => {
    // The engine refuses a query that reads a file: a file function, or FROM or JOIN followed by a
    // quoted string. A comparison written IS DISTINCT FROM 'x' matches the second rule and every tile
    // on it fails live, so every managed chart goes through the engine's own check here.
    it('passes the file-access check for every managed chart, plain and library', () => {
        const all = analyticsContentAsCode.flatMap((bundle) => bundle.charts);
        const { charts: drawn } = withLibraryCharts(
            all,
            analyticsLibraryChartBindings,
            installedTypes(),
        );
        const refused = [...all, ...drawn].flatMap((chart) => {
            if (!explores.some(({ name }) => name === chart.tableName))
                return [`${chart.slug}: no explore`];
            try {
                DuckdbWarehouseClient.validateUserSqlFileAccess(sqlOf(chart));
                return [];
            } catch (error) {
                return [`${chart.slug}: ${(error as Error).message}`];
            }
        });
        expect(refused).toEqual([]);
        expect(all.length).toBeGreaterThan(100);
    });

    it('would have caught a comparison written IS DISTINCT FROM a string', () => {
        expect(() =>
            DuckdbWarehouseClient.validateUserSqlFileAccess(
                "SELECT 1 FROM t WHERE a IS DISTINCT FROM 'ANALYTICS'",
            ),
        ).toThrow('file table paths are not allowed');
    });
});

describe('legends and colour ranges that hold up with real volumes', () => {
    const bindings = [...analyticsLibraryChartBindings.entries()];

    it('caps the colour range of every heatmap and says so on the tile', () => {
        const heatmaps = bindings.filter(([, { slug }]) => slug === 'heatmap');
        expect(heatmaps.map(([slug]) => slug).sort()).toEqual([
            'lightdash-analytics-adoption-adoption-activity-by-person-and-day',
            'lightdash-analytics-overview-agent-requests-by-agent-and-day',
            'lightdash-analytics-overview-ai-tokens-by-feature-and-model',
            'lightdash-analytics-overview-tokens-by-feature',
        ]);
        const charts = analyticsContentAsCode.flatMap(
            (bundle) => bundle.charts,
        );
        heatmaps.forEach(([slug, { minVersion, optionValues }]) => {
            expect(minVersion).toBe('0.5.1');
            expect(optionValues.colorClampPercentile).toBe(95);
            // Said by the heatmap only: the plain table it replaces has no colour scale
            const plain = charts.find((chart) => chart.slug === slug)!;
            expect(plain.description).not.toContain('95th percentile');
            const [drawn] = withLibraryCharts(
                [plain],
                analyticsLibraryChartBindings,
                installedTypes(),
            ).charts;
            expect(drawn.description).toContain(
                'The colour scale stops at the 95th percentile.',
            );
            expect(
                drawn
                    .description!.split(/[.?!](?:\s+|$)/)
                    .filter((sentence) => sentence.trim()),
            ).toHaveLength(2);
        });
    });

    it('lists providers, not every model, in the legend of a stacked model chart', () => {
        const stacked = bindings.filter(
            ([, { fieldMapping }]) =>
                fieldMapping.splitBy === 'ai_usage_model_name',
        );
        expect(stacked.map(([slug]) => slug).sort()).toEqual([
            'lightdash-analytics-overview-ai-calls-by-day',
            'lightdash-analytics-overview-ai-consumption-by-person-feature-and-model',
            'lightdash-analytics-overview-tokens-by-day',
        ]);
        stacked.forEach(([, { optionValues, minVersion }]) => {
            expect(optionValues.legendMode).toBe('groups');
            expect(minVersion).toBe('0.18.7');
        });
    });
});

describe('a fix that every card needs', () => {
    it('asks for the big number version whose sparkline is not clipped, on every card', () => {
        const cards = [...analyticsLibraryChartBindings.values()].filter(
            ({ slug }) => slug === 'big-number-with-sparkline-trend',
        );
        expect(cards.length).toBeGreaterThan(30);
        expect(new Set(cards.map(({ minVersion }) => minVersion))).toEqual(
            new Set(['0.8.3']),
        );
    });
});
