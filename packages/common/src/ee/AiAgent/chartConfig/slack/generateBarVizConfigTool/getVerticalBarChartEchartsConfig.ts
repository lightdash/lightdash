import { type EChartsOption } from 'echarts';
import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import { type ToolVerticalBarArgsTransformed } from '../../../schemas';
import { type GetPivotedResultsFn } from '../types';

/**
 * Generates vertical bar chart echarts config for server-side rendering
 */
export const getVerticalBarChartEchartsConfig = async (
    vizTool: ToolVerticalBarArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
    sorts: MetricQuery['sorts'],
    getPivotedResults: GetPivotedResultsFn,
): Promise<EChartsOption> => {
    let chartData = rows;
    let metrics = vizTool.vizConfig.yMetrics;
    if (vizTool.vizConfig.breakdownByDimension) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            [vizTool.vizConfig.breakdownByDimension],
            vizTool.vizConfig.yMetrics,
            sorts,
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }
    const fields = Object.keys(chartData[0] || {});
    return {
        dataset: {
            source: chartData,
            dimensions: fields,
        },
        ...(vizTool.title ? { title: { text: vizTool.title } } : {}),
        animation: false,
        backgroundColor: '#fff',
        ...(metrics.length > 1
            ? {
                  // This is needed so we don't have overlapping legend and grid
                  legend: {
                      top: 40,
                      left: 'left',
                  },
                  grid: {
                      top: 100,
                  },
              }
            : {}),
        xAxis: [
            {
                type: vizTool.vizConfig.xAxisType,
                ...(vizTool.vizConfig.xAxisLabel
                    ? { name: vizTool.vizConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(vizTool.vizConfig.yAxisLabel
                    ? { name: vizTool.vizConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'bar',
            name: metric,
            encode: {
                x: vizTool.vizConfig.xDimension,
                y: metric,
            },
            ...(vizTool.vizConfig.stackBars ? { stack: 'stack' } : {}),
        })),
    };
};
