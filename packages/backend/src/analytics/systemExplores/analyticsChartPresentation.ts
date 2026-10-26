import {
    CartesianSeriesType,
    ChartType,
    Compact,
    ConditionalFormattingColorApplyTo,
    FilterOperator,
    type ChartAsCode,
    type ConditionalFormattingConfig,
} from '@lightdash/common';

// A shared visual vocabulary for managed content. Queries and identity fields
// stay intact: a table row can represent several people, projects or surfaces.
const colors = ['#4263EB', '#0CA678', '#7950F2', '#E67700', '#D6336C'];
const warning = '#C92A2A';

const numberRule = (
    field: string,
    operator: FilterOperator,
    color: string,
    darkColor: string,
): ConditionalFormattingConfig => ({
    target: { fieldId: field },
    color,
    darkColor,
    applyTo: ConditionalFormattingColorApplyTo.TEXT,
    textStyle: { bold: true },
    rules: [{ id: `${field}-${operator}`, operator, values: [0] }],
});

const styleTable = (chart: ChartAsCode): ChartAsCode => {
    if (chart.chartConfig.type !== ChartType.TABLE) return chart;
    const { config } = chart.chartConfig;
    const columns = { ...config?.columns };
    for (const field of chart.metricQuery.metrics) {
        columns[field] = { ...columns[field], width: 180 };
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
        columns[firstLabel] = {
            ...columns[firstLabel],
            // A wide content label must scroll on small screens instead of
            // freezing across the entire viewport.
            frozen: !firstLabel.endsWith('_content_name'),
            width: firstLabel.endsWith('_content_name') ? 420 : 240,
        };
    }
    const rules: ConditionalFormattingConfig[] = [
        ...(config?.conditionalFormattings ?? []),
    ];
    for (const field of chart.metricQuery.metrics) {
        if (/error|failure|negative_feedback/.test(field)) {
            rules.push(
                numberRule(
                    field,
                    FilterOperator.GREATER_THAN,
                    warning,
                    '#FFA8A8',
                ),
            );
        }
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
            color: colors[1],
            negativeColor: '#E67700',
            width: 180,
        };
        columns.monthly_change_percent = { name: 'Change (%)', width: 150 };
        rules.push(
            numberRule(
                'monthly_change_percent',
                FilterOperator.GREATER_THAN,
                '#087F5B',
                '#63E6BE',
            ),
            numberRule(
                'monthly_change_percent',
                FilterOperator.LESS_THAN,
                '#A65300',
                '#FFD8A8',
            ),
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
                showResultsTotal: true,
                columns,
                conditionalFormattings: rules,
            },
        },
    };
};

const monthlyComparison = (chart: ChartAsCode): ChartAsCode => {
    if (!chart.slug.endsWith('-queries-run-month-over-month')) return chart;
    const month = 'query_events_event_ts_month';
    const total = 'query_events_total_queries';
    return {
        ...chart,
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: month,
                    yField: [total, 'monthly_change_percent'],
                    connectNulls: false,
                },
                eChartsConfig: {
                    xAxis: [{ name: 'Month (UTC)' }],
                    yAxis: [
                        { name: 'Queries', min: '0' },
                        { name: 'Change (%)' },
                    ],
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            name: 'Queries',
                            color: colors[0],
                            yAxisIndex: 0,
                            encode: {
                                xRef: { field: month },
                                yRef: { field: total },
                            },
                        },
                        {
                            type: CartesianSeriesType.LINE,
                            name: 'Change vs previous month (%)',
                            color: colors[1],
                            showSymbol: true,
                            smooth: false,
                            yAxisIndex: 1,
                            encode: {
                                xRef: { field: month },
                                yRef: { field: 'monthly_change_percent' },
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
                    groupFieldIds: ['content_health_owner_status'],
                    metricId: 'content_health_total_content',
                    isDonut: true,
                    showLegend: true,
                    groupLabelOverrides: {
                        'Active organization member': 'Active member',
                        'Not an organization member': 'Not a member',
                        'Unknown user': 'Unknown owner',
                        Unassigned: 'No owner',
                    },
                    groupColorOverrides: {
                        'Active organization member': colors[1],
                        Deactivated: colors[3],
                        Unassigned: colors[0],
                        'Not an organization member': colors[2],
                        'Unknown user': '#868E96',
                        'Not recorded': '#ADB5BD',
                    },
                },
            },
        };
    }
    if (chart.chartConfig.type === ChartType.BIG_NUMBER) {
        const isTokens =
            chart.chartConfig.config?.selectedField?.includes('tokens');
        let { name } = chart;
        if (chart.slug.endsWith('-avg-execution-time'))
            name = 'Avg. warehouse time (ms)';
        if (chart.slug.endsWith('-p90-execution-time'))
            name = 'P90 warehouse time (ms)';
        return {
            ...chart,
            name,
            chartConfig: {
                ...chart.chartConfig,
                config: {
                    ...chart.chartConfig.config,
                    style: isTokens ? Compact.AUTO : undefined,
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
                    valueLabel: 'hidden',
                    legendPosition: 'horizontal',
                    legendMaxItemLength: 28,
                    groupColorOverrides: {
                        ...chart.chartConfig.config?.groupColorOverrides,
                        completed: colors[1],
                        complete: colors[1],
                        success: colors[1],
                        failed: warning,
                        error: warning,
                        pending: colors[3],
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
                        color: colors[index % colors.length],
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
