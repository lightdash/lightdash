import {
    AiMetricQueryWithFilters,
    AiResultType,
    MetricQuery,
    ToolVerticalBarArgsTransformed,
} from '@lightdash/common';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getPivotedResults } from '../utils/getPivotedResults';

const echartsConfigVerticalBarMetric = async (
    vizTool: ToolVerticalBarArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = vizTool.vizConfig.yMetrics;
    if (vizTool.vizConfig.breakdownByDimension) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            vizTool.vizConfig.breakdownByDimension,
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

export const renderVerticalBarViz = async ({
    queryResults,
    vizTool,
    metricQuery,
}: {
    queryResults: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    vizTool: ToolVerticalBarArgsTransformed;
    metricQuery: AiMetricQueryWithFilters;
}): Promise<{
    type: AiResultType.VERTICAL_BAR_RESULT;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    metricQuery: AiMetricQueryWithFilters;
    chartOptions: object;
}> => {
    const chartOptions = await echartsConfigVerticalBarMetric(
        vizTool,
        queryResults.rows,
        queryResults.fields,
        metricQuery.sorts,
    );

    return {
        type: AiResultType.VERTICAL_BAR_RESULT,
        metricQuery,
        results: queryResults,
        chartOptions,
    };
};
