import {
    CartesianSeriesType,
    ChartType,
    CustomFormatType,
    DashboardTileTypes,
    FilterOperator,
    MetricType,
    TableCalculationType,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import { adoptionChartSpecs, adoptionDashboardSpec } from './adoptionDashboard';
import { embedChartSpecs, embedDashboardSpec } from './embedDashboard';
import { peopleNoActivityChartSpecs } from './peopleNoActivityCharts';
import { usageActivityOriginSql } from './usageActivityOrigin';
import { usageChartSpecs } from './usageDashboardCharts';
import { usageDashboardSpecs } from './usageDashboardDefinitions';
import type {
    AnalyticsContentBundle,
    UsageChartSpec,
} from './usageDashboardTypes';

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
    const nameField = `${chart.tableName}_user_name`;
    const emailField = `${chart.tableName}_user_email`;
    const idField = `${chart.tableName}_user_id`;
    if (
        chart.chartConfig.type !== ChartType.TABLE ||
        !chart.metricQuery.dimensions.includes(nameField) ||
        !chart.metricQuery.dimensions.includes(idField)
    ) {
        return chart;
    }
    const columns = chart.chartConfig.config?.columns;
    const name = `\${${chart.tableName}.user_name}`;
    const email = `\${${chart.tableName}.user_email}`;
    const id = `\${${chart.tableName}.user_id}`;
    const displayField = 'user_display_name';
    const originName = 'activity_origin';
    const originField = `${chart.tableName}_${originName}`;
    return {
        ...chart,
        description: `${chart.description} Primary email is shown when no display name is available. User <ID> means neither a display name nor primary email is available; No user recorded means no user identifier was captured. Activity source lists captured origins within each row; older summaries cannot recover missing embed context.`,
        metricQuery: {
            ...chart.metricQuery,
            dimensions: [
                ...new Set([...chart.metricQuery.dimensions, emailField]),
            ],
            metrics: [...chart.metricQuery.metrics, originField],
            additionalMetrics: [
                ...(chart.metricQuery.additionalMetrics ?? []),
                {
                    table: chart.tableName,
                    name: originName,
                    label: 'Activity source',
                    type: MetricType.STRING,
                    sql: usageActivityOriginSql(chart.tableName),
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

const chartConfig = (spec: UsageChartSpec): ChartAsCode['chartConfig'] => {
    const [metric] = spec.metrics;
    const [dimension] = spec.dimensions;
    if (spec.visualization === 'number') {
        return {
            type: ChartType.BIG_NUMBER,
            config: { selectedField: metric, showBigNumberLabel: false },
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
                    series: yFields.map((field, index) => ({
                        ...(spec.fieldLabels?.[field]
                            ? { name: spec.fieldLabels[field] }
                            : {}),
                        type: seriesType,
                        color: ['#5C7CFA', '#12B886'][index % 2],
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
                    spec.dimensions
                        .filter((field) => field.endsWith('_id'))
                        .map((field) => [field, { visible: false }]),
                ),
                ...Object.fromEntries(
                    Object.entries(spec.fieldLabels ?? {}).map(
                        ([field, name]) => [field, { name }],
                    ),
                ),
            },
        },
    };
};

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
        metricOverrides: Object.fromEntries(
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
                            round: 1,
                        },
                    },
                ]),
        ),
        filters: spec.filters
            ? {
                  dimensions: {
                      id: `${spec.key}-filters`,
                      and: spec.filters.map(
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
            : {},
        sorts: spec.sorts,
        limit: spec.limit,
        tableCalculations: spec.tableCalculations ?? [],
        ...(spec.timezone ? { timezone: spec.timezone } : {}),
    },
    chartConfig: chartConfig(spec),
    tableConfig: {
        columnOrder: [
            ...spec.dimensions,
            ...spec.metrics,
            ...(spec.tableCalculations ?? []).map(({ name }) => name),
        ],
    },
});

const note = (
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
    adoptionDashboardSpec,
    embedDashboardSpec,
];

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
            description: `${spec.description} Duplicate this dashboard to keep a customized copy separate from future Sync content updates.`,
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
                const noteHeight = section.noteHeight ?? 2;
                dashboard.tiles.push(
                    note(
                        tab.key,
                        y,
                        noteHeight,
                        `### ${section.title}\n\n${section.description}`,
                    ),
                );
                y += noteHeight;
                const sectionCharts = section.charts.map((key) => {
                    const definition = [
                        ...usageChartSpecs,
                        ...adoptionChartSpecs,
                        ...embedChartSpecs,
                        ...peopleNoActivityChartSpecs,
                    ].find((item) => item.key === key);
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
                    if (isKpiRow) h = 3;
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
                    if (isKpiRow) {
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
                    if (!isKpiRow && !isVisualPair && (!summary || index === 1))
                        nextY += h;
                });
                if (isKpiRow) y = sectionY + 3;
                else if (isVisualPair) y = sectionY + 7;
                else y = nextY;
            }
        }
        return {
            dashboard,
            charts: charts.map((chart) =>
                withContentLinks(withUserActivityLabels(chart)),
            ),
        };
    });
