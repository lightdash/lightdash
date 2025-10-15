import { type EChartsOption } from 'echarts';
import { type ItemsMap } from '../../../../../../types/field';
import { type SortField } from '../../../../../../types/metricQuery';
import { getCartesianAxisFormatterConfig } from '../../../../../../visualizations/helpers/getCartesianAxisFormatterConfig';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';
import { type GetPivotedResultsFn } from '../../types';

/**
 * Generates horizontal bar chart echarts config for server-side rendering
 */
export const getHorizontalBarChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
    getPivotedResults: GetPivotedResultsFn,
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
        ...getCommonEChartsConfig(queryTool.title, metrics.length, chartData),
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
