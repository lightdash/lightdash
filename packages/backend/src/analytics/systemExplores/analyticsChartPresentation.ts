import {
    CartesianSeriesType,
    ChartType,
    Compact,
    ConditionalFormattingColorApplyTo,
    FilterOperator,
    type ChartAsCode,
    type ConditionalFormattingConfig,
} from '@lightdash/common';
import { analyticsColorPalette } from './analyticsColorPalette';
import { monthLabel } from './monthlyQueryComparisonCharts';

// A shared visual vocabulary for managed content. Queries and identity fields
// stay intact: a table row can represent several people, projects or surfaces.
// Series take the Analytics palette, so built-in charts match library charts.
const colors = analyticsColorPalette.colors.slice(0, 5);
// Meaning-bearing colours stay fixed whatever the palette.
// Good and not-good share one pair everywhere: a cache hit, a pass and a success are green, a cache
// miss, a fail and an error are orange. Waiting is amber and unknown is grey. Red marks error counts in
// table cells only.
export const positive = '#34D399';
export const caution = '#FB923C';
export const waiting = '#FBBF24';
// A measure that is itself an outcome keeps the outcome's colour, whatever its place in the chart
const outcomeColor = (field: string): string | undefined => {
    if (/_passed_/.test(field)) return positive;
    if (/_failed_/.test(field)) return caution;
    return undefined;
};
const warning = '#C92A2A';
const positiveTint = '#D1FAE5';
const cautionTint = '#FFEDD5';
const waitingTint = '#FEF3C7';

const numberRule = (
    field: string,
    operator: FilterOperator,
    color: string,
): ConditionalFormattingConfig => ({
    target: { fieldId: field },
    color,
    // Cell formatting computes a contrasting foreground in both themes.
    applyTo: ConditionalFormattingColorApplyTo.CELL,
    textStyle: { bold: true },
    rules: [{ id: `${field}-${operator}`, operator, values: [0] }],
});

const styleTable = (chart: ChartAsCode): ChartAsCode => {
    if (chart.chartConfig.type !== ChartType.TABLE) return chart;
    const { config } = chart.chartConfig;
    const columns = { ...config?.columns };
    // Narrow enough for five measures beside a name without the last one being cut off
    for (const field of chart.metricQuery.metrics) {
        columns[field] = { ...columns[field], width: 140 };
    }
    for (const field of chart.metricQuery.dimensions) {
        if (field.endsWith('_name'))
            columns[field] = { ...columns[field], width: 240 };
    }
    const primaryMetric = chart.metricQuery.metrics.find(
        (field) =>
            !/_(at|rate|coverage|share|origin)$/.test(field) &&
            !field.endsWith('_activity_origin'),
    );
    if (primaryMetric) {
        columns[primaryMetric] = {
            ...columns[primaryMetric],
            displayStyle: 'bar',
            color: colors[0],
            width: 180,
        };
    }
    const visibleFields = chart.tableConfig?.columnOrder?.filter(
        (field) =>
            !field.endsWith('_id') &&
            !field.endsWith('_url') &&
            columns[field]?.visible !== false,
    );
    const firstLabel =
        visibleFields?.find(
            (field) =>
                ['person', 'user_display_name'].includes(field) ||
                /_(name|label)$/.test(field),
        ) ?? visibleFields?.[0];
    if (firstLabel) {
        let width = 240;
        if (firstLabel.endsWith('_app_name')) width = 320;
        if (firstLabel.endsWith('_content_name')) width = 420;
        columns[firstLabel] = {
            ...columns[firstLabel],
            // A wide content label must scroll on small screens instead of
            // freezing across the entire viewport.
            frozen: width === 240,
            width,
        };
    }
    const rules: ConditionalFormattingConfig[] = [
        ...(config?.conditionalFormattings ?? []),
    ];
    for (const field of chart.metricQuery.metrics) {
        if (/error|failure|negative_feedback/.test(field)) {
            // A light tint with dark text: a solid colour made one failure look like an outage
            rules.push({
                ...numberRule(field, FilterOperator.GREATER_THAN, cautionTint),
                textStyle: undefined,
            });
        }
    }
    // The action column of a list to act on: orange for what to check first, amber for the rest
    if (
        chart.metricQuery.tableCalculations.some(
            ({ name }) => name === 'review_status',
        )
    ) {
        (
            [
                ['Nothing uses it: check first', cautionTint],
                ['Still on a dashboard or schedule', waitingTint],
            ] as const
        ).forEach(([value, color]) =>
            rules.push({
                target: { fieldId: 'review_status' },
                color,
                applyTo: ConditionalFormattingColorApplyTo.CELL,
                rules: [
                    {
                        id: `review_status-${value}`,
                        operator: FilterOperator.EQUALS,
                        values: [value],
                    },
                ],
            }),
        );
        columns.review_status = { ...columns.review_status, width: 260 };
    }
    for (const field of chart.metricQuery.dimensions) {
        if (field.endsWith('_url')) {
            columns[field] = { ...columns[field], visible: false };
        }
        if (field.endsWith('_content_type')) {
            columns[field] = { ...columns[field], width: 130 };
        }
    }
    if (
        chart.metricQuery.tableCalculations.some(
            ({ name }) => name === 'monthly_change',
        )
    ) {
        columns.monthly_change = {
            name: 'Change',
            displayStyle: 'bar',
            color: positive,
            negativeColor: caution,
            width: 180,
        };
        columns.monthly_change_percent = { name: 'Change (%)', width: 150 };
        // Narrow columns, so the table fits beside the chart without scrolling sideways
        columns[monthLabel] = { ...columns[monthLabel], width: 130 };
        const [counted] = chart.metricQuery.metrics;
        columns[counted] = { ...columns[counted], width: 150 };
        // Light tints of the same green and orange as the Change bars, with dark text
        rules.push(
            {
                ...numberRule(
                    'monthly_change_percent',
                    FilterOperator.GREATER_THAN,
                    positiveTint,
                ),
                textStyle: undefined,
            },
            {
                ...numberRule(
                    'monthly_change_percent',
                    FilterOperator.LESS_THAN,
                    cautionTint,
                ),
                textStyle: undefined,
            },
        );
    }
    return {
        ...chart,
        chartConfig: {
            ...chart.chartConfig,
            config: {
                ...config,
                showTableNames: false,
                hideRowNumbers: true,
                showResultsTotal: false,
                columns,
                conditionalFormattings: rules,
            },
        },
    };
};

const monthlyComparison = (chart: ChartAsCode): ChartAsCode => {
    if (!chart.slug.endsWith('-queries-run-month-over-month')) return chart;
    const total = 'query_events_total_queries';
    return {
        ...chart,
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: monthLabel,
                    yField: [total],
                    connectNulls: false,
                },
                eChartsConfig: {
                    xAxis: [{ name: 'Month (UTC)' }],
                    // Bars only. The change is in the table beside the chart: as a line it ran off
                    // the top whenever a month doubled.
                    yAxis: [{ name: 'Queries', min: '0' }],
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            name: 'Queries',
                            color: colors[0],
                            yAxisIndex: 0,
                            encode: {
                                xRef: { field: monthLabel },
                                yRef: { field: total },
                            },
                        },
                    ],
                },
            },
        },
    };
};

export const withAnalyticsChartPresentation = (
    input: ChartAsCode,
): ChartAsCode => {
    let chart = monthlyComparison(styleTable(input));
    if (chart.slug.endsWith('-content-ownership-current-snapshot')) {
        chart = {
            ...chart,
            chartConfig: {
                type: ChartType.PIE,
                config: {
                    groupFieldIds: ['content_health_owner_status_name'],
                    metricId: 'content_health_total_content',
                    isDonut: true,
                    showLegend: true,
                    // The slices are named by the plain-name field
                    groupColorOverrides: {
                        'Active member': positive,
                        Deactivated: caution,
                        'No owner': colors[0],
                        'Not a member': colors[2],
                        'Unknown owner': '#868E96',
                    },
                },
            },
        };
    }
    if (chart.chartConfig.type === ChartType.BIG_NUMBER) {
        const isTokens =
            chart.chartConfig.config?.selectedField?.includes('tokens');
        let style = chart.chartConfig.config?.style;
        if (isTokens) style = Compact.AUTO;
        // Keep counts and duration values exact; preserve other explicit formats.
        else if (style === Compact.AUTO) style = undefined;
        let { name } = chart;
        if (chart.slug.endsWith('-avg-execution-time'))
            name = 'Average warehouse time (s)';
        if (chart.slug.endsWith('-p90-execution-time'))
            name = 'P90 warehouse time (s)';
        return {
            ...chart,
            name,
            chartConfig: {
                ...chart.chartConfig,
                config: {
                    ...chart.chartConfig.config,
                    style,
                },
            },
        };
    }
    if (chart.chartConfig.type === ChartType.PIE) {
        return {
            ...chart,
            chartConfig: {
                ...chart.chartConfig,
                config: {
                    ...chart.chartConfig.config,
                    showValue: false,
                    showPercentage: true,
                    // The share beside each slice: a donut with no numbers only shows which is bigger
                    valueLabel: 'outside',
                    legendPosition: 'horizontal',
                    legendMaxItemLength: 28,
                    // Outcomes are recorded in lower case
                    groupLabelOverrides: {
                        success: 'Success',
                        error: 'Error',
                        cancelled: 'Cancelled',
                        clarification: 'Needs clarification',
                        pending: 'Pending',
                        unknown: 'Unknown',
                        // A group with no value is drawn with this sign; say what it is
                        '∅': 'Not recorded',
                        ...chart.chartConfig.config?.groupLabelOverrides,
                    },
                    groupColorOverrides: {
                        ...chart.chartConfig.config?.groupColorOverrides,
                        // Plain names of the same outcomes
                        Success: positive,
                        Error: caution,
                        Cancelled: '#868E96',
                        Pending: waiting,
                        'Cache hit': positive,
                        'Cache miss': caution,
                        'Not recorded': '#868E96',
                        '∅': '#868E96',
                        completed: positive,
                        complete: positive,
                        success: positive,
                        failed: caution,
                        error: caution,
                        pending: waiting,
                        unknown: '#868E96',
                    },
                },
            },
        };
    }
    if (chart.chartConfig.type !== ChartType.CARTESIAN) return chart;
    const { config } = chart.chartConfig;
    if (!config) return chart;
    const horizontal = config.layout?.flipAxes === true;
    const series = config.eChartsConfig?.series ?? [];
    return {
        ...chart,
        chartConfig: {
            ...chart.chartConfig,
            config: {
                ...config,
                layout: {
                    ...config.layout,
                    connectNulls: false,
                    showGridX: horizontal,
                    showGridY: !horizontal,
                },
                eChartsConfig: {
                    ...config.eChartsConfig,
                    showAxisTicks: false,
                    axisLabelFontSize: 11,
                    axisTitleFontSize: 12,
                    grid: {
                        containLabel: true,
                        left: '64',
                        right: '64',
                        top: '48',
                        bottom: '40',
                    },
                    legend: {
                        show: series.length > 1,
                        type: 'scroll',
                        top: '0',
                        left: 'center',
                        icon: 'roundRect',
                    },
                    series: series.map((item, index) => ({
                        ...item,
                        color:
                            outcomeColor(item.encode.yRef.field) ??
                            colors[index % colors.length],
                        // A single observed period must remain visible even
                        // when there is no second point to draw a line to.
                        showSymbol:
                            item.type === CartesianSeriesType.LINE ||
                            item.showSymbol,
                        smooth: false,
                        label: { show: false, showOverlappingLabels: false },
                    })),
                },
            },
        },
    };
};
