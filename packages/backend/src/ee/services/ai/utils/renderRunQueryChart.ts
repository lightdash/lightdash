import {
    AnyType,
    formatFieldLabel,
    getCartesianAxisFormatterConfig,
    SortField,
    type ItemsMap,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import { EChartsOption } from 'echarts';
import type { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getPivotedResults } from './getPivotedResults';

/**
 * Generates common echarts config for all chart types
 */
const getCommonChartConfig = (
    title: string | undefined,
    metricsCount: number,
    chartData: Record<string, unknown>[],
) => ({
    ...(title
        ? {
              title: {
                  text: title,
                  left: 'center',
                  top: 10,
                  textStyle: {
                      fontSize: 16,
                      fontWeight: 'bold' as const,
                  },
              },
          }
        : {}),
    legend: {
        show: metricsCount > 1,
        type: 'scroll' as const,
        orient: 'horizontal' as const,
        bottom: 10,
        left: 'center' as const,
        padding: [5, 10],
        itemGap: 15,
        itemWidth: 25,
        itemHeight: 14,
        textStyle: {
            fontSize: 11,
        },
        pageIconSize: 12,
        pageTextStyle: {
            fontSize: 11,
        },
    },
    grid: {
        containLabel: true,
        left: '3%',
        right: '3%',
        top: title ? 50 : 20,
        bottom: metricsCount > 1 ? 70 : 50,
    },
    animation: false,
    backgroundColor: '#fff',
    dataset: {
        source: chartData,
        dimensions: Object.keys(chartData[0] || {}),
    },
});

/**
 * Generates bar chart echarts config for server-side rendering
 */
const getBarChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): Promise<EChartsOption> => {
    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: string[] = queryMetrics;
    let chartData = rows;

    if (chartConfig?.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            queryMetrics,
            sorts as SortField[],
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    const xAxisField = fieldsMap[xDimension];
    const yAxisField = queryMetrics[0] ? fieldsMap[queryMetrics[0]] : undefined;

    return {
        ...getCommonChartConfig(queryTool.title, metrics.length, chartData),
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? ('category' as const),
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: xAxisField,
                    show: true,
                }),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: yAxisField,
                    show: true,
                }),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'bar',
            // Use formatted label for non-pivoted metrics, otherwise use the metric name as-is (already formatted by pivot)
            name: queryMetrics.includes(metric)
                ? formatFieldLabel(metric, fieldsMap)
                : metric,
            encode: {
                x: xDimension,
                y: metric,
            },
            ...(chartConfig?.stackBars ? { stack: 'stack' } : {}),
        })),
    };
};

/**
 * Generates line chart echarts config for server-side rendering
 */
const getLineChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): Promise<EChartsOption> => {
    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: string[] = queryMetrics;
    let chartData = rows;

    if (chartConfig?.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            queryMetrics,
            sorts as SortField[],
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    const xAxisField = fieldsMap[xDimension];
    const yAxisField = queryMetrics[0] ? fieldsMap[queryMetrics[0]] : undefined;

    return {
        ...getCommonChartConfig(queryTool.title, metrics.length, chartData),
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? 'time',
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: xAxisField,
                    show: true,
                }),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: yAxisField,
                    show: true,
                }),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'line',
            // Use formatted label for non-pivoted metrics, otherwise use the metric name as-is (already formatted by pivot)
            name: queryMetrics.includes(metric)
                ? formatFieldLabel(metric, fieldsMap)
                : metric,
            encode: {
                x: xDimension,
                y: metric,
            },
            ...(chartConfig?.lineType === 'area' && {
                areaStyle: {},
            }),
            showSymbol: true,
        })),
    };
};

/**
 * Generates horizontal bar chart echarts config for server-side rendering
 */
const getHorizontalBarChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): Promise<EChartsOption> => {
    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: string[] = queryMetrics;
    let chartData = rows;

    if (chartConfig?.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            queryMetrics,
            sorts as SortField[],
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    // Get axis field items for formatting (note: x/y are flipped for horizontal charts)
    const yAxisField = fieldsMap[xDimension]; // Category axis
    const xAxisField = queryMetrics[0] ? fieldsMap[queryMetrics[0]] : undefined; // Value axis

    return {
        ...getCommonChartConfig(queryTool.title, metrics.length, chartData),
        xAxis: [
            {
                type: 'value',
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: xAxisField,
                    show: true,
                }),
            },
        ],
        yAxis: [
            {
                type: chartConfig?.xAxisType ?? ('category' as const),
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: yAxisField,
                    show: true,
                }),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'bar',
            // Use formatted label for non-pivoted metrics, otherwise use the metric name as-is (already formatted by pivot)
            name: queryMetrics.includes(metric)
                ? formatFieldLabel(metric, fieldsMap)
                : metric,
            encode: {
                x: metric,
                y: xDimension,
            },
            ...(chartConfig?.stackBars ? { stack: 'stack' } : {}),
        })),
    };
};

/**
 * Generates scatter chart echarts config for server-side rendering
 */
const getScatterChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): Promise<EChartsOption> => {
    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = dimensions[0];
    let metrics: string[] = queryMetrics;
    let chartData = rows;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (chartConfig?.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            queryMetrics,
            sorts as SortField[],
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    // Get axis field items for formatting
    const xAxisField = fieldsMap[xDimension];
    const yAxisField = queryMetrics[0] ? fieldsMap[queryMetrics[0]] : undefined;

    return {
        ...getCommonChartConfig(queryTool.title, metrics.length, chartData),
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? ('category' as const),
                ...(chartConfig?.xAxisLabel
                    ? { name: chartConfig.xAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: xAxisField,
                    show: true,
                }),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(chartConfig?.yAxisLabel
                    ? { name: chartConfig.yAxisLabel }
                    : {}),
                ...getCartesianAxisFormatterConfig({
                    axisItem: yAxisField,
                    show: true,
                }),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'scatter',
            // Use formatted label for non-pivoted metrics, otherwise use the metric name as-is (already formatted by pivot)
            name: queryMetrics.includes(metric)
                ? formatFieldLabel(metric, fieldsMap)
                : metric,
            encode: {
                x: xDimension,
                y: metric,
            },
            showSymbol: true,
        })),
    };
};

/**
 * Generates pie chart echarts config for server-side rendering
 */
const getPieChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
): AnyType => {
    const { dimensions, metrics } = queryTool.queryConfig;

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
): AnyType => {
    const { dimensions, metrics } = queryTool.queryConfig;

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
 * Generates echarts options from ToolRunQueryArgs
 * Helpful for generating charts for AI agents on Slack
 * @param queryTool - ToolRunQueryArgsTransformed
 * @param queryResults - QueryResults
 * @returns EChartsOption | null
 */
export const generateEchartsOptionsForRunQuery = async (
    queryTool: ToolRunQueryArgsTransformed,
    queryResults: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >,
): Promise<EChartsOption | null> => {
    const chartType = queryTool.chartConfig?.defaultVizType ?? 'table';

    // Don't render table as image
    if (chartType === 'table') {
        return Promise.resolve(null);
    }

    const { rows, fields: fieldsMap } = queryResults;

    // Empty data - don't render
    if (rows.length === 0) {
        return Promise.resolve(null);
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
            return getPieChartEchartsConfig(queryTool, rows);

        case 'funnel':
            return getFunnelChartEchartsConfig(queryTool, rows);

        default:
            return Promise.resolve(null);
    }
};
