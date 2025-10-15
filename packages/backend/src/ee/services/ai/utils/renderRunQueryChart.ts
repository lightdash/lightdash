import {
    AnyType,
    formatFieldLabel,
    formatPivotValueLabel,
    getPivotedData,
    type ItemsMap,
    type PivotReference,
    type ResultRow,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import type { ProjectService } from '../../../../services/ProjectService/ProjectService';

/**
 * Generates bar chart echarts config for server-side rendering
 */
const getBarChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): AnyType => {
    const { dimensions, metrics: queryMetrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: (string | PivotReference)[] = queryMetrics;
    let chartData = rows;

    // Determine if we should pivot based on chartConfig.groupBy
    const breakdownDimension = chartConfig?.groupBy?.[0] ?? null;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (breakdownDimension) {
        const pivot = getPivotedData(
            rows as ResultRow[],
            [breakdownDimension],
            queryMetrics,
            [], // No pivoted dimensions
        );
        chartData = pivot.rows;
        metrics = Object.values(pivot.rowKeyMap);
    }

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            type: 'plain',
        },
        grid: { containLabel: true },
        animation: false,
        backgroundColor: '#fff',
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? 'category',
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => {
            const defaultProperties: AnyType = {
                type: 'bar',
                yAxisIndex: 0,
            };

            if (typeof metric === 'string') {
                return {
                    ...defaultProperties,
                    name: formatFieldLabel(metric, fieldsMap),
                    encode: {
                        x: xDimension,
                        y: metric,
                    },
                };
            }

            return {
                ...defaultProperties,
                name: formatPivotValueLabel(metric, fieldsMap),
                encode: {
                    x: xDimension,
                    y: metric,
                },
                ...(chartConfig?.stackBars && {
                    stack: metric.field,
                }),
            };
        }),
    };
};

/**
 * Generates line chart echarts config for server-side rendering
 */
const getLineChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): AnyType => {
    const { dimensions, metrics: queryMetrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: (string | PivotReference)[] = queryMetrics;
    let chartData = rows;

    // Determine if we should pivot based on chartConfig.groupBy
    const breakdownDimension = chartConfig?.groupBy?.[0] ?? null;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (breakdownDimension) {
        const pivoted = getPivotedData(
            rows as ResultRow[],
            [breakdownDimension],
            queryMetrics,
            [], // No pivoted dimensions
        );
        chartData = pivoted.rows;
        metrics = Object.values(pivoted.rowKeyMap);
    }

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            type: 'plain',
        },
        grid: { containLabel: true },
        animation: false,
        backgroundColor: '#fff',
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? 'time',
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => {
            const defaultProperties: AnyType = {
                type: 'line',
                yAxisIndex: 0,
                ...(chartConfig?.lineType === 'area' && {
                    areaStyle: {},
                }),
                showSymbol: true,
            };

            if (typeof metric === 'string') {
                return {
                    ...defaultProperties,
                    name: formatFieldLabel(metric, fieldsMap),
                    encode: {
                        x: xDimension,
                        y: metric,
                    },
                };
            }

            return {
                ...defaultProperties,
                name: formatPivotValueLabel(metric, fieldsMap),
                encode: {
                    x: xDimension,
                    y: metric,
                },
            };
        }),
    };
};

/**
 * Generates horizontal bar chart echarts config for server-side rendering
 */
const getHorizontalBarChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): AnyType => {
    const { dimensions, metrics: queryMetrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: (string | PivotReference)[] = queryMetrics;
    let chartData = rows;

    // Determine if we should pivot based on chartConfig.groupBy
    const breakdownDimension = chartConfig?.groupBy?.[0] ?? null;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (breakdownDimension) {
        const pivot = getPivotedData(
            rows as ResultRow[],
            [breakdownDimension],
            queryMetrics,
            [], // No pivoted dimensions
        );
        chartData = pivot.rows;
        metrics = Object.values(pivot.rowKeyMap);
    }

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            type: 'plain',
        },
        grid: { containLabel: true },
        animation: false,
        backgroundColor: '#fff',
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        xAxis: [
            {
                type: 'value',
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: chartConfig?.xAxisType ?? 'category',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => {
            const defaultProperties: AnyType = {
                type: 'bar',
                yAxisIndex: 0,
            };

            if (typeof metric === 'string') {
                return {
                    ...defaultProperties,
                    name: formatFieldLabel(metric, fieldsMap),
                    encode: {
                        x: metric,
                        y: xDimension,
                    },
                };
            }

            return {
                ...defaultProperties,
                name: formatPivotValueLabel(metric, fieldsMap),
                encode: {
                    x: metric,
                    y: xDimension,
                },
                ...(chartConfig?.stackBars && {
                    stack: metric.field,
                }),
            };
        }),
    };
};

/**
 * Generates scatter chart echarts config for server-side rendering
 */
const getScatterChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): AnyType => {
    const { dimensions, metrics: queryMetrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: (string | PivotReference)[] = queryMetrics;
    let chartData = rows;

    // Determine if we should pivot based on chartConfig.groupBy
    const breakdownDimension = chartConfig?.groupBy?.[0] ?? null;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (breakdownDimension) {
        const pivoted = getPivotedData(
            rows as ResultRow[],
            [breakdownDimension],
            queryMetrics,
            [], // No pivoted dimensions
        );
        chartData = pivoted.rows;
        metrics = Object.values(pivoted.rowKeyMap);
    }

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            type: 'plain',
        },
        grid: { containLabel: true },
        animation: false,
        backgroundColor: '#fff',
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? 'category',
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => {
            const defaultProperties: AnyType = {
                type: 'scatter',
                yAxisIndex: 0,
                showSymbol: true,
            };

            if (typeof metric === 'string') {
                return {
                    ...defaultProperties,
                    name: formatFieldLabel(metric, fieldsMap),
                    encode: {
                        x: xDimension,
                        y: metric,
                    },
                };
            }

            return {
                ...defaultProperties,
                name: formatPivotValueLabel(metric, fieldsMap),
                encode: {
                    x: xDimension,
                    y: metric,
                },
            };
        }),
    };
};

/**
 * Generates pie chart echarts config for server-side rendering
 */
const getPieChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): AnyType => {
    const { dimensions, metrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;

    const groupField = dimensions[0];
    const metricField = metrics[0];

    // Transform data for pie chart
    const data = rows.map((row) => ({
        name: String(row[groupField]),
        value: row[metricField],
    }));

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            orient: 'horizontal',
            bottom: 10,
        },
        animation: false,
        backgroundColor: '#fff',
        series: [
            {
                type: 'pie',
                data,
                label: {
                    formatter: '{b}: {c} ({d}%)',
                },
            },
        ],
    };
};

/**
 * Generates funnel chart echarts config for server-side rendering
 */
const getFunnelChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): AnyType => {
    const { dimensions, metrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;

    const metricField = metrics[0];

    // Transform data for funnel chart
    const data = rows.map((row) => {
        // Use first dimension as the name
        const name = dimensions.length > 0 ? String(row[dimensions[0]]) : '';
        return {
            name,
            value: row[metricField],
        };
    });

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            orient: 'horizontal',
            bottom: 10,
        },
        animation: false,
        backgroundColor: '#fff',
        series: [
            {
                type: 'funnel',
                data,
                label: {
                    position: 'inside',
                },
                sort: 'descending',
            },
        ],
    };
};

/**
 * Main function to generate echarts options for runQuery tool for Slack rendering
 */
export const generateEchartsOptionsForRunQuery = (
    queryTool: ToolRunQueryArgsTransformed,
    queryResults: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >,
): AnyType | null => {
    const chartType = queryTool.chartConfig?.defaultVizType ?? 'table';

    // Don't render table as image
    if (chartType === 'table') {
        return null;
    }

    const { rows, fields: fieldsMap } = queryResults;

    // Empty data - don't render
    if (rows.length === 0) {
        return null;
    }

    switch (chartType) {
        case 'bar':
            return getBarChartEchartsConfig(queryTool, rows, fieldsMap);

        case 'horizontal':
            return getHorizontalBarChartEchartsConfig(
                queryTool,
                rows,
                fieldsMap,
            );

        case 'line':
            return getLineChartEchartsConfig(queryTool, rows, fieldsMap);

        case 'scatter':
            return getScatterChartEchartsConfig(queryTool, rows, fieldsMap);

        case 'pie':
            return getPieChartEchartsConfig(queryTool, rows, fieldsMap);

        case 'funnel':
            return getFunnelChartEchartsConfig(queryTool, rows, fieldsMap);

        default:
            return null;
    }
};
