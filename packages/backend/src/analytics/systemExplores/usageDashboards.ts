import {
    CartesianSeriesType,
    ChartType,
    CustomFormatType,
    DashboardTileTypes,
    FilterOperator,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import { usageChartSpecs } from './usageDashboardCharts';
import { usageDashboardSpecs } from './usageDashboardDefinitions';
import type {
    AnalyticsContentBundle,
    UsageChartSpec,
} from './usageDashboardTypes';

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
            columns: Object.fromEntries(
                spec.dimensions
                    .filter((field) => field.endsWith('_id'))
                    .map((field) => [field, { visible: false }]),
            ),
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
                      and: spec.filters.map(({ field, values }) => ({
                          id: `${spec.key}-${field}`,
                          target: { fieldId: field },
                          operator: FilterOperator.EQUALS,
                          values,
                      })),
                  },
              }
            : {},
        sorts: spec.sorts,
        limit: spec.limit,
        tableCalculations: [],
    },
    chartConfig: chartConfig(spec),
    tableConfig: { columnOrder: [...spec.dimensions, ...spec.metrics] },
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

export const buildUsageDashboards = (
    existingBundles: AnalyticsContentBundle[],
): AnalyticsContentBundle[] =>
    usageDashboardSpecs.map((spec) => {
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
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
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
                dashboard.tiles.push(
                    note(
                        tab.key,
                        y,
                        2,
                        `### ${section.title}\n\n${section.description}`,
                    ),
                );
                y += 2;
                const sectionCharts = section.charts.map((key) => {
                    const definition = usageChartSpecs.find(
                        (item) => item.key === key,
                    );
                    if (!definition)
                        throw new Error(`Unknown built-in chart: ${key}`);
                    const definitionChart = buildChart(
                        definition,
                        spec.key,
                        spaceSlug,
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
                sectionCharts.forEach((item, index) => {
                    const w = isKpiRow ? 36 / sectionCharts.length : 36;
                    dashboard.tiles.push({
                        uuid: undefined,
                        type: DashboardTileTypes.SAVED_CHART,
                        tileSlug: `${tab.key}-${item.slug}`,
                        tabSlug: tab.key,
                        x: isKpiRow ? index * w : 0,
                        y: isKpiRow ? sectionY : sectionY + index * 6,
                        w,
                        h: isKpiRow ? 3 : 6,
                        properties: { chartSlug: item.slug },
                    });
                });
                y += isKpiRow ? 3 : sectionCharts.length * 6;
            }
        }
        return { dashboard, charts };
    });
