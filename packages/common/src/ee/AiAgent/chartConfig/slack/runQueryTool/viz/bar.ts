import { type EChartsOption } from 'echarts';
import { type ItemsMap } from '../../../../../../types/field';
import { type SortField } from '../../../../../../types/metricQuery';
import { getCartesianAxisFormatterConfig } from '../../../../../../visualizations/helpers/getCartesianAxisFormatterConfig';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';
import { type GetPivotedResultsFn } from '../../types';

/**
 * Generates bar chart echarts config for server-side rendering
 */
export const getBarChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
    getPivotedResults: GetPivotedResultsFn,
): Promise<EChartsOption> => {
    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = chartConfig?.xAxisDimension || dimensions[0];
    const yMetrics = chartConfig?.yAxisMetrics || queryMetrics;
    let metrics: string[] = yMetrics;
    let chartData = rows;

    if (chartConfig?.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            yMetrics,
            sorts as SortField[],
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    const xAxisField = fieldsMap[xDimension];
    const yAxisField = yMetrics[0] ? fieldsMap[yMetrics[0]] : undefined;

    const primarySort = sorts?.[0];
    const shouldInverseXAxis =
        primarySort?.fieldId === xDimension && primarySort?.descending === true;

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
                ...(shouldInverseXAxis ? { inverse: true } : {}),
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
            type: 'bar',
            // Use formatted label for non-pivoted metrics, otherwise use the metric name as-is (already formatted by pivot)
            name: yMetrics.includes(metric)
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
