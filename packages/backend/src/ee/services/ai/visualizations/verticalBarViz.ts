import {
    AiChartType,
    AiMetricQuery,
    MetricQuery,
    metricQueryVerticalBarViz,
    VerticalBarVizTool,
} from '@lightdash/common';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getPivotedResults } from '../utils/getPivotedResults';

const echartsConfigVerticalBarMetric = async (
    vizTool: Pick<VerticalBarVizTool, 'vizConfig' | 'filters'>,
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
        ...(vizTool.vizConfig.title
            ? { title: { text: vizTool.vizConfig.title } }
            : {}),
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
    runMetricQuery,
    vizTool,
}: {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizTool: Pick<VerticalBarVizTool, 'vizConfig' | 'filters'>;
}): Promise<{
    type: AiChartType.VERTICAL_BAR_CHART;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    metricQuery: AiMetricQuery;
    chartOptions: object;
}> => {
    const metricQuery = metricQueryVerticalBarViz(vizTool);
    const results = await runMetricQuery(metricQuery);
    const chartOptions = await echartsConfigVerticalBarMetric(
        vizTool,
        results.rows,
        results.fields,
        metricQuery.sorts,
    );

    return {
        type: AiChartType.VERTICAL_BAR_CHART,
        metricQuery,
        results,
        chartOptions,
    };
};
