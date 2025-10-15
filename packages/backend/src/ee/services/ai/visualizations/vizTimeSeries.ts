import {
    AiMetricQueryWithFilters,
    AiResultType,
    MetricQuery,
    metricQueryTimeSeriesViz,
    ToolTimeSeriesArgsTransformed,
} from '@lightdash/common';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getPivotedResults } from '../utils/getPivotedResults';

export const echartsConfigTimeSeriesMetric = async (
    vizTool: ToolTimeSeriesArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = vizTool.vizConfig.yMetrics;
    if (vizTool.vizConfig.breakdownByDimension) {
        // Sort the pivoted data
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

    return {
        ...(vizTool.title ? { title: { text: vizTool.title } } : {}),
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
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        animation: false,
        backgroundColor: '#fff',
        xAxis: [
            {
                type: 'time',
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
            type: 'line',
            name: metric,
            encode: {
                x: vizTool.vizConfig.xDimension,
                y: metric,
            },
            ...(vizTool.vizConfig.lineType === 'area' && { areaStyle: {} }),
        })),
    };
};

export const renderTimeSeriesViz = async ({
    queryResults,
    vizTool,
    metricQuery,
}: {
    queryResults: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    vizTool: ToolTimeSeriesArgsTransformed;
    metricQuery: AiMetricQueryWithFilters;
}): Promise<{
    type: AiResultType.TIME_SERIES_RESULT;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    metricQuery: AiMetricQueryWithFilters;
    chartOptions: object;
}> => {
    const chartOptions = await echartsConfigTimeSeriesMetric(
        vizTool,
        queryResults.rows,
        queryResults.fields,
        metricQuery.sorts,
    );

    return {
        type: AiResultType.TIME_SERIES_RESULT,
        metricQuery,
        results: queryResults,
        chartOptions,
    };
};
