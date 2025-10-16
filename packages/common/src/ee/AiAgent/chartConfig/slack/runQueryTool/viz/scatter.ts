import { type EChartsOption } from 'echarts';
import { type ItemsMap } from '../../../../../../types/field';
import { type SortField } from '../../../../../../types/metricQuery';
import { getCartesianAxisFormatterConfig } from '../../../../../../visualizations/helpers/getCartesianAxisFormatterConfig';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';
import { type GetPivotedResultsFn } from '../../types';

/**
 * Generates scatter chart echarts config for server-side rendering
 */
export const getScatterChartEchartsConfig = async (
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
        ...getCommonEChartsConfig(
            queryTool.title,
            metrics.length,
            chartData,
            chartConfig?.xAxisLabel,
            chartConfig?.yAxisLabel,
        ),
        xAxis: [
            {
                type: chartConfig?.xAxisType ?? ('category' as const),
                ...getCartesianAxisFormatterConfig({
                    axisItem: xAxisField,
                    show: true,
                }),
            },
        ],
        yAxis: [
            {
                type: 'value',
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
