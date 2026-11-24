import {
    CartesianSeriesType,
    ChartType,
    Compact,
    CustomFormatType,
    DashboardTileTypes,
    FilterOperator,
    MetricType,
    TableCalculationType,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import { adoptionChartSpecs, adoptionDashboardSpec } from './adoptionDashboard';
import {
    agentEvaluationsChartSpecs,
    agentEvaluationsDashboardSpec,
} from './agentEvaluationsDashboard';
import { analyticsColorPalette } from './analyticsColorPalette';
import { contentChartSpecs, contentDashboardSpec } from './contentDashboard';
import { dataAppsChartSpecs, dataAppsDashboardSpec } from './dataAppsDashboard';
import { embedChartSpecs, embedDashboardSpec } from './embedDashboard';
import { homeChartSpecs, homeDashboardSpec } from './homeDashboard';
import type { LibraryChartBinding } from './libraryCharts';
import { noteRows, titledNote } from './noteLayout';
import { peopleNoActivityChartSpecs } from './peopleNoActivityCharts';
import { toolsChartSpecs, toolsDashboardSpec } from './toolsDashboard';
import { usageActivityOriginSql } from './usageActivityOrigin';
import { usageChartSpecs } from './usageDashboardCharts';
import { usageDashboardSpecs } from './usageDashboardDefinitions';
import { withUsageDashboardFilters } from './usageDashboardFilters';
import type {
    AnalyticsContentBundle,
    UsageChartSpec,
} from './usageDashboardTypes';
import { usageFieldLabels } from './usageFieldLabels';

const withContentLinks = (chart: ChartAsCode): ChartAsCode => {
    if (chart.chartConfig.type !== ChartType.TABLE) return chart;
    const urlFields = chart.metricQuery.dimensions
        .filter((field) => /_(chart|dashboard|content)_name$/.test(field))
        .map((field) => field.replace(/_name$/, '_url'));
    if (urlFields.length === 0) return chart;
    return {
        ...chart,
        metricQuery: {
            ...chart.metricQuery,
            dimensions: [
                ...new Set([...chart.metricQuery.dimensions, ...urlFields]),
            ],
        },
        chartConfig: {
            ...chart.chartConfig,
            config: {
                ...chart.chartConfig.config,
                columns: {
                    ...chart.chartConfig.config?.columns,
                    ...Object.fromEntries(
                        urlFields.map((field) => [field, { visible: false }]),
                    ),
                },
            },
        },
        tableConfig: {
            ...chart.tableConfig,
            columnOrder: [
                ...new Set([
                    ...(chart.tableConfig?.columnOrder ?? []),
                    ...urlFields,
                ]),
            ],
        },
    };
};

const withPeopleDisplayName = (chart: ChartAsCode): ChartAsCode => {
    const nameField = 'people_adoption_name';
    const emailField = 'people_adoption_email';
    const idField = 'people_adoption_user_id';
    if (
        chart.tableName !== 'people_adoption' ||
        chart.chartConfig.type !== ChartType.TABLE ||
        !chart.metricQuery.dimensions.includes(nameField) ||
        !chart.metricQuery.dimensions.includes(idField)
    )
        return chart;
    const displayField = 'person';
    return {
        ...chart,
        metricQuery: {
            ...chart.metricQuery,
            dimensions: [
                ...new Set([...chart.metricQuery.dimensions, emailField]),
            ],
            tableCalculations: [
                ...chart.metricQuery.tableCalculations,
                {
                    name: displayField,
                    displayName: 'Person',
                    type: TableCalculationType.STRING,
                    sql: "COALESCE(NULLIF(TRIM(${people_adoption.name}), ''), NULLIF(TRIM(${people_adoption.email}), ''), 'User ' || ${people_adoption.user_id})",
                },
            ],
        },
        chartConfig: {
            ...chart.chartConfig,
            config: {
                ...chart.chartConfig.config,
                columns: {
                    ...chart.chartConfig.config?.columns,
                    [nameField]: { visible: false },
                    [emailField]: { visible: false },
                },
            },
        },
        tableConfig: {
            ...chart.tableConfig,
            columnOrder: [
                ...(chart.tableConfig?.columnOrder ?? []).flatMap((field) =>
                    field === nameField ? [displayField, field] : [field],
                ),
                emailField,
            ],
        },
    };
};

const withUserActivityLabels = (chart: ChartAsCode): ChartAsCode => {
    const tableName =
        chart.tableName === 'agent_request_starts'
            ? 'agent_requests'
            : chart.tableName;
    const nameField = `${tableName}_user_name`;
    const emailField = `${tableName}_user_email`;
    const idField = `${tableName}_user_id`;
    if (
        chart.chartConfig.type !== ChartType.TABLE ||
        !chart.metricQuery.dimensions.includes(nameField) ||
        !chart.metricQuery.dimensions.includes(idField)
    ) {
        return chart;
    }
    const columns = chart.chartConfig.config?.columns;
    const name = `\${${tableName}.user_name}`;
    const email = `\${${tableName}.user_email}`;
    const id = `\${${tableName}.user_id}`;
    const displayField = 'user_display_name';
    const originName = 'activity_origin';
    const originField = `${tableName}_${originName}`;
    return {
        ...chart,
        metricQuery: {
            ...chart.metricQuery,
            dimensions: [
                ...new Set([...chart.metricQuery.dimensions, emailField]),
            ],
            metrics: [...chart.metricQuery.metrics, originField],
            additionalMetrics: [
                ...(chart.metricQuery.additionalMetrics ?? []),
                {
                    table: tableName,
                    name: originName,
                    label: 'Activity source',
                    type: MetricType.STRING,
                    sql: usageActivityOriginSql(tableName),
                },
            ],
            tableCalculations: [
                ...chart.metricQuery.tableCalculations,
                {
                    name: displayField,
                    displayName: columns?.[nameField]?.name ?? 'User name',
                    type: TableCalculationType.STRING,
                    sql: `CASE
                        WHEN NULLIF(TRIM(${name}), '') IS NOT NULL AND ${name} <> 'Unknown user' THEN ${name}
                        WHEN NULLIF(TRIM(${email}), '') IS NOT NULL THEN TRIM(${email})
                        WHEN NULLIF(TRIM(${id}), '') IS NOT NULL THEN 'User ' || ${id}
                        ELSE 'No user recorded'
                    END`,
                },
            ],
        },
        chartConfig: {
            ...chart.chartConfig,
            config: {
                ...chart.chartConfig.config,
                columns: {
                    ...columns,
                    [nameField]: { ...columns?.[nameField], visible: false },
                    [emailField]: { ...columns?.[emailField], visible: false },
                },
            },
        },
        tableConfig: {
            ...chart.tableConfig,
            columnOrder: [
                ...(chart.tableConfig?.columnOrder ?? []).flatMap((field) =>
                    field === nameField
                        ? [displayField, originField, field]
                        : [field],
                ),
                emailField,
            ],
        },
    };
};

export const topCategoryRank = 'top_category_rank';
const topCategoryTotal = 'top_category_total';

// A chart's own labels, over the shared plain names for the fields it uses.
const fieldLabelsOf = (spec: UsageChartSpec): Record<string, string> => ({
    ...Object.fromEntries(
        [...spec.dimensions, ...spec.metrics].flatMap((field) =>
            usageFieldLabels[field] ? [[field, usageFieldLabels[field]]] : [],
        ),
    ),
    ...spec.fieldLabels,
});

const chartConfig = (spec: UsageChartSpec): ChartAsCode['chartConfig'] => {
    const labels = fieldLabelsOf(spec);
    const [metric] = spec.metrics;
    const [dimension] = spec.dimensions;
    if (spec.visualization === 'number') {
        return {
            type: ChartType.BIG_NUMBER,
            // A number can show a table calculation, named as its one y field
            config: {
                selectedField: spec.yFields?.[0] ?? metric,
                showBigNumberLabel: false,
            },
        };
    }
    if (spec.visualization === 'donut') {
        return {
            type: ChartType.PIE,
            config: {
                groupFieldIds: [dimension],
                metricId: metric,
                isDonut: true,
                showLegend: true,
                showPercentage: true,
                showValue: true,
                valueLabel: 'outside',
            },
        };
    }
    if (spec.visualization) {
        const xField = spec.xField ?? dimension;
        const yFields = spec.yFields ?? spec.metrics;
        const seriesType = {
            line: CartesianSeriesType.LINE,
            bar: CartesianSeriesType.BAR,
            scatter: CartesianSeriesType.SCATTER,
        }[spec.visualization];
        return {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField,
                    yField: yFields,
                    flipAxes: spec.flipAxes ?? false,
                },
                eChartsConfig: {
                    showAxisTicks: false,
                    // An unnamed axis falls back to the raw field label.
                    ...(labels[xField]
                        ? { xAxis: [{ name: labels[xField] }] }
                        : {}),
                    ...(yFields.length === 1 && labels[yFields[0]]
                        ? { yAxis: [{ name: labels[yFields[0]] }] }
                        : {}),
                    series: yFields.map((field, index) => ({
                        ...(labels[field] ? { name: labels[field] } : {}),
                        type: seriesType,
                        color: analyticsColorPalette.colors[index % 2],
                        showSymbol: true,
                        smooth: false,
                        yAxisIndex: 0,
                        encode: { xRef: { field: xField }, yRef: { field } },
                    })),
                },
            },
        };
    }
    return {
        type: ChartType.TABLE,
        config: {
            showTableNames: false,
            hideRowNumbers: true,
            columns: {
                ...Object.fromEntries(
                    Object.entries(labels).map(([field, name]) => [
                        field,
                        { name },
                    ]),
                ),
                // After the names, so a hidden column that also has a name stays hidden
                ...Object.fromEntries(
                    [
                        ...spec.dimensions.filter((field) =>
                            field.endsWith('_id'),
                        ),
                        ...(spec.hiddenColumns ?? []),
                    ].map((field) => [
                        field,
                        {
                            ...(labels[field] ? { name: labels[field] } : {}),
                            visible: false,
                        },
                    ]),
                ),
                // The ranking behind a top-categories filter is not something to read
                ...(spec.topCategories
                    ? {
                          [topCategoryTotal]: { visible: false },
                          [topCategoryRank]: { visible: false },
                      }
                    : {}),
            },
        },
    };
};

// Models named differently from the table their fields belong to
const tableOfExplore: Record<string, string> = {
    content_inventory: 'content_health',
    content_created: 'content_health',
    agent_request_starts: 'agent_requests',
};

// Ranks each category by its total over the whole result, so a filter can keep the largest ones.
const topCategoryCalculations = (
    spec: UsageChartSpec,
): NonNullable<UsageChartSpec['tableCalculations']> => {
    if (!spec.topCategories) return [];
    const table = tableOfExplore[spec.explore] ?? spec.explore;
    const ref = (field: string) =>
        `\${${table}.${field.slice(table.length + 1)}}`;
    const { category, metric } = spec.topCategories;
    return [
        {
            name: topCategoryTotal,
            displayName: 'Category total',
            type: TableCalculationType.NUMBER,
            sql: `SUM(${ref(metric)}) OVER (PARTITION BY ${ref(category)})`,
        },
        {
            name: topCategoryRank,
            displayName: 'Category rank',
            type: TableCalculationType.NUMBER,
            sql: `DENSE_RANK() OVER (ORDER BY \${${topCategoryTotal}} DESC, ${ref(category)})`,
        },
    ];
};

// Counts on a chart axis read 10K and 10M, not 10,000 and 10,000,000. Rates and durations keep their
// own formats.
export const compactAxisOverrides = (metrics: string[]) =>
    Object.fromEntries(
        metrics
            .filter(
                (field) =>
                    !['_ms', '_s', '_rate', '_coverage', '_share'].some(
                        (suffix) => field.endsWith(suffix),
                    ),
            )
            .map((field) => [
                field,
                {
                    formatOptions: {
                        type: CustomFormatType.NUMBER,
                        compact: Compact.AUTO,
                    },
                },
            ]),
    );

/** Millisecond metrics show as whole numbers: decimals add noise, not signal. */
export const wholeMillisecondOverrides = (metrics: string[]) =>
    Object.fromEntries(
        metrics
            .filter((field) => field.endsWith('_ms'))
            .map((field) => [
                field,
                {
                    formatOptions: {
                        type: CustomFormatType.NUMBER,
                        round: 0,
                    },
                },
            ]),
    );

// Every tile about viewed content is about content the organization made, so views of Lightdash's own
// analytics dashboards are left out. They still count in tiles about people's activity.
const filtersOf = (
    spec: UsageChartSpec,
): NonNullable<UsageChartSpec['filters']> => [
    ...(spec.filters ?? []),
    ...(spec.explore === 'content_reach'
        ? [{ field: 'content_reach_in_analytics_project', values: [false] }]
        : []),
];

const buildChart = (
    spec: UsageChartSpec,
    dashboardSlug: string,
    spaceSlug: string,
): ChartAsCode => ({
    version: 1,
    slug: `${dashboardSlug}-${spec.key}`,
    dashboardSlug,
    spaceSlug,
    name: spec.name,
    description: spec.description,
    tableName: spec.explore,
    metricQuery: {
        exploreName: spec.explore,
        dimensions: spec.dimensions,
        metrics: spec.metrics,
        metricOverrides: {
            ...(spec.compactCounts ||
            (spec.visualization &&
                ['line', 'bar', 'scatter'].includes(spec.visualization))
                ? compactAxisOverrides(spec.metrics)
                : {}),
            ...Object.fromEntries(
                spec.metrics
                    .filter((field) =>
                        ['_rate', '_coverage', '_share'].some((suffix) =>
                            field.endsWith(suffix),
                        ),
                    )
                    .map((field) => [
                        field,
                        {
                            formatOptions: {
                                type: CustomFormatType.PERCENT,
                                // An axis reads 80%, not 80.0%. A table keeps the decimal.
                                round:
                                    spec.visualization &&
                                    ['line', 'bar', 'scatter'].includes(
                                        spec.visualization,
                                    )
                                        ? 0
                                        : 1,
                            },
                        },
                    ]),
            ),
            ...wholeMillisecondOverrides(spec.metrics),
        },
        filters: {
            ...(spec.topCategories
                ? {
                      tableCalculations: {
                          id: `${spec.key}-top-categories`,
                          and: [
                              {
                                  id: `${spec.key}-${topCategoryRank}`,
                                  target: { fieldId: topCategoryRank },
                                  operator: FilterOperator.LESS_THAN_OR_EQUAL,
                                  values: [spec.topCategories.count],
                              },
                          ],
                      },
                  }
                : {}),
            ...(filtersOf(spec).length > 0
                ? {
                      dimensions: {
                          id: `${spec.key}-filters`,
                          and: filtersOf(spec).map(
                              ({ field, values, operator, settings }) => ({
                                  id: `${spec.key}-${field}`,
                                  target: { fieldId: field },
                                  operator: operator ?? FilterOperator.EQUALS,
                                  values,
                                  ...(settings ? { settings } : {}),
                              }),
                          ),
                      },
                  }
                : {}),
        },
        sorts: spec.sorts,
        limit: spec.limit,
        tableCalculations: [
            ...(spec.tableCalculations ?? []),
            ...topCategoryCalculations(spec),
        ],
        ...(spec.timezone ? { timezone: spec.timezone } : {}),
    },
    chartConfig: chartConfig(spec),
    tableConfig: {
        columnOrder: spec.columnOrder ?? [
            ...spec.dimensions,
            ...spec.metrics,
            ...(spec.tableCalculations ?? []).map(({ name }) => name),
        ],
    },
});

export const note = (
    tabSlug: string,
    y: number,
    h: number,
    content: string,
): DashboardAsCode['tiles'][number] => ({
    uuid: undefined,
    tileSlug: undefined,
    type: DashboardTileTypes.MARKDOWN,
    tabSlug,
    x: 0,
    y,
    w: 36,
    h,
    properties: { title: '', content, hideFrame: true },
});

const dashboardSpecs = [
    ...usageDashboardSpecs,
    contentDashboardSpec,
    dataAppsDashboardSpec,
    toolsDashboardSpec,
    agentEvaluationsDashboardSpec,
    adoptionDashboardSpec,
    embedDashboardSpec,
    homeDashboardSpec,
];

const allChartSpecs: UsageChartSpec[] = [
    ...homeChartSpecs,
    ...usageChartSpecs,
    ...contentChartSpecs,
    ...dataAppsChartSpecs,
    ...toolsChartSpecs,
    ...agentEvaluationsChartSpecs,
    ...adoptionChartSpecs,
    ...embedChartSpecs,
    ...peopleNoActivityChartSpecs,
];

// A chart is found by its key alone, so two charts with one key would silently share a definition
const duplicateKey = allChartSpecs
    .map(({ key }) => key)
    .find((key, index, keys) => keys.indexOf(key) !== index);
if (duplicateKey)
    throw new Error(`Duplicate built-in chart key: ${duplicateKey}`);

export const usageLibraryChartBindings: ReadonlyMap<
    string,
    LibraryChartBinding
> = new Map(
    dashboardSpecs.flatMap((dashboard) =>
        dashboard.tabs
            .flatMap((tab) => tab.sections)
            .flatMap((section) => section.charts)
            .flatMap((key): [string, LibraryChartBinding][] => {
                const binding = allChartSpecs.find(
                    (item) => item.key === key,
                )?.libraryChart;
                return binding ? [[`${dashboard.key}-${key}`, binding]] : [];
            }),
    ),
);

export const buildUsageDashboards = (
    existingBundles: AnalyticsContentBundle[],
): AnalyticsContentBundle[] =>
    dashboardSpecs.map((spec) => {
        const existing = existingBundles.find(
            ({ dashboard }) => dashboard.slug === spec.key,
        );
        const spaceSlug = existing?.dashboard.spaceSlug ?? spec.key;
        const charts = [...(existing?.charts ?? [])];
        const dashboard: DashboardAsCode = {
            version: 1,
            slug: spec.key,
            spaceSlug,
            name: spec.name,
            description: spec.description,
            filters: spec.filters ?? {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            tabs: existing
                ? [{ slug: 'overview', name: 'Overview', order: 0 }]
                : [],
            tiles: (existing?.dashboard.tiles ?? []).map((tile) => ({
                ...tile,
                tabSlug: 'overview',
            })),
        };
        for (const tab of spec.tabs) {
            dashboard.tabs.push({
                slug: tab.key,
                name: tab.name,
                order: dashboard.tabs.length,
            });
            let y = 0;
            for (const section of tab.sections) {
                if (section.note !== false) {
                    const content = section.caption
                        ? section.description
                        : titledNote(section.title, section.description);
                    // As tall as its text and no taller
                    const noteHeight = noteRows(content);
                    dashboard.tiles.push(note(tab.key, y, noteHeight, content));
                    y += noteHeight;
                }
                const sectionCharts = section.charts.map((key) => {
                    const definition = allChartSpecs.find(
                        (item) => item.key === key,
                    );
                    if (!definition)
                        throw new Error(`Unknown built-in chart: ${key}`);
                    const definitionChart = withPeopleDisplayName(
                        buildChart(definition, spec.key, spaceSlug),
                    );
                    if (
                        !charts.some(
                            ({ slug }) => slug === definitionChart.slug,
                        )
                    )
                        charts.push(definitionChart);
                    return definitionChart;
                });
                const isKpiRow = sectionCharts.every(
                    (item) => item.chartConfig.type === ChartType.BIG_NUMBER,
                );
                const sectionY = y;
                const isRow = section.layout === 'row';
                const hasSummaryTrend =
                    sectionCharts[0]?.chartConfig.type ===
                        ChartType.BIG_NUMBER &&
                    sectionCharts[1]?.chartConfig.type === ChartType.CARTESIAN;
                const isVisualPair =
                    sectionCharts.length === 2 &&
                    sectionCharts.every(
                        (item) =>
                            item.chartConfig.type === ChartType.CARTESIAN ||
                            item.chartConfig.type === ChartType.PIE,
                    );
                let nextY = sectionY;
                sectionCharts.forEach((item, index) => {
                    const summary = hasSummaryTrend && index < 2;
                    let h = 7;
                    if (isRow) h = section.rowHeight ?? 7;
                    else if (isKpiRow) h = 4;
                    // Compact breakdowns keep a short viewport; longer results
                    // remain available through the table's existing scroll.
                    else if (
                        [
                            'agent-retries-latency-and-consumption',
                            'warehouse-versus-cached-demand',
                        ].some((key) => item.slug.endsWith(`-${key}`))
                    )
                        h = 4;
                    let w = 36;
                    let x = 0;
                    let tileY = nextY;
                    if (isRow) {
                        const widths =
                            section.widths ??
                            sectionCharts.map(() => 36 / sectionCharts.length);
                        w = widths[index];
                        x = widths
                            .slice(0, index)
                            .reduce((total, width) => total + width, 0);
                        tileY = sectionY;
                    } else if (isKpiRow) {
                        w = 36 / sectionCharts.length;
                        x = index * w;
                        tileY = sectionY;
                    } else if (summary) {
                        w = index === 0 ? 9 : 27;
                        x = index === 0 ? 0 : 9;
                        tileY = sectionY;
                    } else if (isVisualPair) {
                        w = 18;
                        x = index * w;
                        tileY = sectionY;
                    }
                    dashboard.tiles.push({
                        uuid: undefined,
                        type: DashboardTileTypes.SAVED_CHART,
                        tileSlug: `${tab.key}-${item.slug}`,
                        tabSlug: tab.key,
                        x,
                        y: tileY,
                        w,
                        h,
                        properties: { chartSlug: item.slug },
                    });
                    if (
                        !isRow &&
                        !isKpiRow &&
                        !isVisualPair &&
                        (!summary || index === 1)
                    )
                        nextY += h;
                });
                if (isRow) y = sectionY + (section.rowHeight ?? 7);
                else if (isKpiRow) y = sectionY + 4;
                else if (isVisualPair) y = sectionY + 7;
                else y = nextY;
            }
        }
        return {
            dashboard: withUsageDashboardFilters(dashboard, charts),
            charts: charts.map((chart) =>
                withContentLinks(withUserActivityLabels(chart)),
            ),
        };
    });
