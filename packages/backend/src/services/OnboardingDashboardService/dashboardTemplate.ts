import {
    CartesianSeriesType,
    ChartType,
    ComparisonFormatTypes,
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    MetricType,
    ParameterError,
    type CreateChartInSpace,
    type CreateDashboard,
    type CreateDashboardChartTile,
    type SemanticLayerDimension,
    type SemanticLayerExplore,
    type SemanticLayerMetric,
    type SemanticLayerResult,
} from '@lightdash/common';

export type CreateChartInput = Omit<
    CreateChartInSpace,
    'spaceUuid' | 'dashboardUuid'
>;

export type DashboardTemplateTile = Omit<
    CreateDashboardChartTile,
    'properties'
> & {
    chartIndex: number;
};

export type DashboardTemplate = Omit<CreateDashboard, 'spaceUuid' | 'tiles'> & {
    tiles: DashboardTemplateTile[];
};

export type DashboardTemplateResult = {
    charts: CreateChartInput[];
    dashboard: DashboardTemplate;
    warnings: string[];
};

const MONEY_PATTERN = /(revenue|amount|price|sales|gmv|value)/i;
const CATEGORY_PATTERN = /(category|type|status|segment|channel)/i;
const SEGMENT_PATTERN = /(channel|segment)/i;
const CUSTOMER_PATTERN = /(customer|client|account|buyer)/i;
const EXCLUDED_FALLBACK_DIMENSION_PATTERN = /(^id$|_id$|name|email)/i;
const TIME_INTERVAL_PATTERN = /_(day|week|month|quarter|year)$/i;

const getPrimaryExplore = (
    semanticLayer: SemanticLayerResult,
): SemanticLayerExplore | null => {
    const recordedPrimary = semanticLayer.explores.find(
        (explore) => explore.name === semanticLayer.primaryExploreName,
    );
    if (recordedPrimary) return recordedPrimary;

    return (
        semanticLayer.explores.find(
            (explore) =>
                explore.dimensions.some(
                    (dimension) =>
                        !dimension.hidden &&
                        (dimension.type === DimensionType.DATE ||
                            dimension.type === DimensionType.TIMESTAMP),
                ) &&
                explore.metrics.some(
                    (metric) =>
                        !metric.hidden &&
                        metric.type === MetricType.SUM &&
                        MONEY_PATTERN.test(`${metric.name} ${metric.label}`),
                ),
        ) ??
        semanticLayer.explores[0] ??
        null
    );
};

const findMetric = (
    metrics: SemanticLayerMetric[],
    type: MetricType,
    preferredPattern?: RegExp,
    requirePreferredMatch = false,
): SemanticLayerMetric | null => {
    const candidates = metrics.filter((metric) => metric.type === type);
    if (preferredPattern) {
        const preferred = candidates.find((metric) =>
            preferredPattern.test(`${metric.name} ${metric.label}`),
        );
        if (preferred) return preferred;
        if (requirePreferredMatch) return null;
    }
    return candidates[0] ?? null;
};

const findTimeDimensions = (
    dimensions: SemanticLayerDimension[],
): {
    filterDimension: SemanticLayerDimension | null;
    chartDimension: SemanticLayerDimension | null;
} => {
    const dates = dimensions.filter(
        (dimension) =>
            dimension.type === DimensionType.DATE ||
            dimension.type === DimensionType.TIMESTAMP,
    );
    const filterDimension =
        dates.find(
            (dimension) => !TIME_INTERVAL_PATTERN.test(dimension.name),
        ) ??
        dates[0] ??
        null;
    if (!filterDimension) {
        return { filterDimension: null, chartDimension: null };
    }
    const chartDimension =
        dates.find(
            (dimension) =>
                dimension.name.endsWith('_month') &&
                dimension.source.table === filterDimension.source.table &&
                dimension.source.column === filterDimension.source.column,
        ) ?? filterDimension;
    return { filterDimension, chartDimension };
};

const selectCategoricalDimensions = (
    dimensions: SemanticLayerDimension[],
): {
    category: SemanticLayerDimension | null;
    segment: SemanticLayerDimension | null;
} => {
    const strings = dimensions.filter(
        (dimension) => dimension.type === DimensionType.STRING,
    );
    const category =
        strings.find((dimension) =>
            CATEGORY_PATTERN.test(`${dimension.name} ${dimension.label}`),
        ) ??
        strings.find(
            (dimension) =>
                !EXCLUDED_FALLBACK_DIMENSION_PATTERN.test(
                    `${dimension.name} ${dimension.label}`,
                ),
        ) ??
        null;
    const remaining = strings.filter(
        (dimension) => dimension.fieldId !== category?.fieldId,
    );
    const segment =
        remaining.find((dimension) =>
            SEGMENT_PATTERN.test(`${dimension.name} ${dimension.label}`),
        ) ??
        remaining.find((dimension) =>
            CATEGORY_PATTERN.test(`${dimension.name} ${dimension.label}`),
        ) ??
        remaining.find(
            (dimension) =>
                !EXCLUDED_FALLBACK_DIMENSION_PATTERN.test(
                    `${dimension.name} ${dimension.label}`,
                ),
        ) ??
        null;
    return { category, segment };
};

const createKpiChart = ({
    explore,
    metric,
    timeDimension,
    name,
}: {
    explore: SemanticLayerExplore;
    metric: SemanticLayerMetric;
    timeDimension: SemanticLayerDimension | null;
    name: string;
}): CreateChartInput => ({
    name,
    description: `${name} from the generated semantic layer`,
    tableName: explore.name,
    metricQuery: {
        exploreName: explore.name,
        dimensions: timeDimension ? [timeDimension.fieldId] : [],
        metrics: [metric.fieldId],
        filters: {},
        sorts: timeDimension
            ? [{ fieldId: timeDimension.fieldId, descending: true }]
            : [],
        limit: timeDimension ? 2 : 1,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.BIG_NUMBER,
        config: {
            selectedField: metric.fieldId,
            showBigNumberLabel: true,
            showTableNamesInLabel: false,
            showComparison: timeDimension !== null,
            comparisonFormat: ComparisonFormatTypes.PERCENTAGE,
            comparisonLabel: timeDimension ? 'vs previous period' : undefined,
        },
    },
    tableConfig: {
        columnOrder: [
            ...(timeDimension ? [timeDimension.fieldId] : []),
            metric.fieldId,
        ],
    },
});

const createCartesianChart = ({
    explore,
    metric,
    dimension,
    name,
    seriesType,
    descending,
    limit,
}: {
    explore: SemanticLayerExplore;
    metric: SemanticLayerMetric;
    dimension: SemanticLayerDimension;
    name: string;
    seriesType: CartesianSeriesType;
    descending: boolean;
    limit: number;
}): CreateChartInput => ({
    name,
    description: `${name} from the generated semantic layer`,
    tableName: explore.name,
    metricQuery: {
        exploreName: explore.name,
        dimensions: [dimension.fieldId],
        metrics: [metric.fieldId],
        filters: {},
        sorts: [
            {
                fieldId: descending ? metric.fieldId : dimension.fieldId,
                descending,
            },
        ],
        limit,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: dimension.fieldId,
                yField: [metric.fieldId],
                flipAxes: false,
            },
            eChartsConfig: {
                series: [
                    {
                        type: seriesType,
                        encode: {
                            xRef: { field: dimension.fieldId },
                            yRef: { field: metric.fieldId },
                        },
                        yAxisIndex: 0,
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [dimension.fieldId, metric.fieldId],
    },
});

const getTileUuid = (index: number): string =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

const createTiles = (
    charts: CreateChartInput[],
    kpiCount: number,
): DashboardTemplateTile[] =>
    charts.map((_, chartIndex) => {
        const isKpi = chartIndex < kpiCount;
        const visualIndex = chartIndex - kpiCount;
        return {
            chartIndex,
            uuid: getTileUuid(chartIndex),
            type: DashboardTileTypes.SAVED_CHART,
            x: isKpi ? (chartIndex % 4) * 6 : (visualIndex % 2) * 12,
            y: isKpi
                ? Math.floor(chartIndex / 4) * 4
                : 4 + Math.floor(visualIndex / 2) * 8,
            w: isKpi ? 6 : 12,
            h: isKpi ? 4 : 8,
            tabUuid: undefined,
        };
    });

export const buildDashboardTemplate = (
    semanticLayer: SemanticLayerResult,
): DashboardTemplateResult => {
    const hasMissingFieldIds = semanticLayer.explores.some(
        (explore) =>
            explore.metrics.some((metric) => !metric.fieldId) ||
            explore.dimensions.some((dimension) => !dimension.fieldId),
    );
    if (hasMissingFieldIds) {
        throw new ParameterError(
            'The stored semantic layer result is outdated. Regenerate the semantic layer, then build the dashboard again.',
        );
    }
    const warnings: string[] = [];
    const charts: CreateChartInput[] = [];
    const primaryExplore = getPrimaryExplore(semanticLayer);
    if (!primaryExplore) {
        warnings.push('No explore is available for dashboard content');
        return {
            charts,
            dashboard: {
                name: 'Starter dashboard',
                description: 'Generated from the project semantic layer',
                tiles: [],
                tabs: [],
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
            },
            warnings,
        };
    }

    const metrics = primaryExplore.metrics.filter((metric) => !metric.hidden);
    const dimensions = primaryExplore.dimensions.filter(
        (dimension) => !dimension.hidden,
    );
    const revenueMetric = findMetric(
        metrics,
        MetricType.SUM,
        MONEY_PATTERN,
        true,
    );
    const countMetric = findMetric(metrics, MetricType.COUNT);
    const averageMetric = findMetric(
        metrics,
        MetricType.AVERAGE,
        MONEY_PATTERN,
        true,
    );
    const uniqueMetric = findMetric(
        metrics,
        MetricType.COUNT_DISTINCT,
        CUSTOMER_PATTERN,
        true,
    );
    const { filterDimension, chartDimension } = findTimeDimensions(dimensions);
    const { category, segment } = selectCategoricalDimensions(dimensions);

    const kpis: Array<{
        metric: SemanticLayerMetric | null;
        name: string;
        warning: string;
    }> = [
        {
            metric: revenueMetric,
            name: revenueMetric?.label ?? 'Total revenue',
            warning:
                'Revenue KPI omitted because no visible SUM money metric exists',
        },
        {
            metric: countMetric,
            name: 'Orders',
            warning:
                'Orders KPI omitted because no visible COUNT metric exists',
        },
        {
            metric: averageMetric,
            name: 'Avg order value',
            warning:
                'Avg order value KPI omitted because no visible AVERAGE metric exists',
        },
        {
            metric: uniqueMetric,
            name: 'Unique customers',
            warning:
                'Unique customers KPI omitted because no visible COUNT_DISTINCT metric exists',
        },
    ];

    kpis.forEach(({ metric, name, warning }) => {
        if (!metric) {
            warnings.push(warning);
            return;
        }
        charts.push(
            createKpiChart({
                explore: primaryExplore,
                metric,
                timeDimension: chartDimension,
                name,
            }),
        );
    });
    const kpiCount = charts.length;

    if (!chartDimension) {
        warnings.push(
            'Period comparisons and time-series chart omitted because no visible date dimension exists',
        );
    } else if (!revenueMetric) {
        warnings.push(
            'Time-series chart omitted because no visible SUM money metric exists',
        );
    } else {
        charts.push(
            createCartesianChart({
                explore: primaryExplore,
                metric: revenueMetric,
                dimension: chartDimension,
                name: `${revenueMetric.label} over time`,
                seriesType: CartesianSeriesType.LINE,
                descending: false,
                limit: 500,
            }),
        );
    }

    if (!category) {
        warnings.push(
            'Categorical breakdown omitted because no visible string dimension exists',
        );
    } else if (!revenueMetric) {
        warnings.push(
            'Categorical breakdown omitted because no visible SUM money metric exists',
        );
    } else {
        charts.push(
            createCartesianChart({
                explore: primaryExplore,
                metric: revenueMetric,
                dimension: category,
                name: `${revenueMetric.label} by ${category.label}`,
                seriesType: CartesianSeriesType.BAR,
                descending: true,
                limit: 10,
            }),
        );
    }

    if (!segment) {
        warnings.push(
            'Segment breakdown omitted because no second visible string dimension exists',
        );
    } else if (!revenueMetric) {
        warnings.push(
            'Segment breakdown omitted because no visible SUM money metric exists',
        );
    } else {
        charts.push(
            createCartesianChart({
                explore: primaryExplore,
                metric: revenueMetric,
                dimension: segment,
                name: `${revenueMetric.label} by ${segment.label}`,
                seriesType: CartesianSeriesType.BAR,
                descending: true,
                limit: 10,
            }),
        );
    }

    const dashboardFilters = [
        ...(filterDimension
            ? [
                  {
                      id: 'onboarding-date-filter',
                      target: {
                          fieldId: filterDimension.fieldId,
                          tableName: filterDimension.source.table,
                      },
                      operator: FilterOperator.IN_BETWEEN,
                      values: [],
                      disabled: true,
                      label: filterDimension.label,
                  },
              ]
            : []),
        ...(category
            ? [
                  {
                      id: 'onboarding-dimension-filter',
                      target: {
                          fieldId: category.fieldId,
                          tableName: category.source.table,
                      },
                      operator: FilterOperator.EQUALS,
                      values: [],
                      disabled: true,
                      label: category.label,
                  },
              ]
            : []),
    ];

    return {
        charts,
        dashboard: {
            name: 'Starter dashboard',
            description: `Generated from ${primaryExplore.label}`,
            tiles: createTiles(charts, kpiCount),
            tabs: [],
            filters: {
                dimensions: dashboardFilters,
                metrics: [],
                tableCalculations: [],
            },
        },
        warnings,
    };
};
