import { type EChartsOption } from 'echarts';
import { type ItemsMap } from '../../../../../../types/field';
import { type SortField } from '../../../../../../types/metricQuery';
import { getCartesianAxisFormatterConfig } from '../../../../../../visualizations/helpers/getCartesianAxisFormatterConfig';
import { type ToolRunQueryArgsTransformedBuiltinChart } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';
import { type GetPivotedResultsFn } from '../../types';

/**
 * Generates bar chart echarts config for server-side rendering
 */
export const getBarChartEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformedBuiltinChart,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
    getPivotedResults: GetPivotedResultsFn,
): Promise<EChartsOption> => {
    const { dimensions, metrics: queryMetrics, sorts } = queryTool.queryConfig;
    const { chartConfig } = queryTool;
    const xDimension = chartConfig?.xAxisDimension || dimensions[0];
    const yMetrics = chartConfig?.yAxisMetrics || queryMetrics;
    const secondaryYAxisMetric = chartConfig?.secondaryYAxisMetric;
    let metrics: string[] = yMetrics;
    let secondaryMetrics: string[] = secondaryYAxisMetric
        ? [secondaryYAxisMetric]
        : [];
    let getSeriesName = (key: string) => formatFieldLabel(key, fieldsMap);
    let chartData = rows;

    if (chartConfig?.groupBy?.length) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            chartConfig.groupBy,
            yMetrics,
            secondaryMetrics,
            sorts as SortField[],
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
        secondaryMetrics = pivoted.secondaryMetrics;
        getSeriesName = (key: string) => pivoted.labels[key];
    }

    const xAxisField = fieldsMap[xDimension];
    const yAxisField = yMetrics[0] ? fieldsMap[yMetrics[0]] : undefined;
    const secondaryYAxisField = secondaryYAxisMetric
        ? fieldsMap[secondaryYAxisMetric]
        : undefined;

    const primarySort = sorts?.[0];
    const shouldInverseXAxis =
        primarySort?.fieldId === xDimension && primarySort?.descending === true;

    const yAxisConfig = [
        {
            type: 'value' as const,
            ...getCartesianAxisFormatterConfig({
                axisItem: yAxisField,
                show: true,
            }),
        },
        ...(secondaryYAxisField
            ? [
                  {
                      type: 'value' as const,
                      ...getCartesianAxisFormatterConfig({
                          axisItem: secondaryYAxisField,
                          show: true,
                      }),
                  },
              ]
            : []),
    ];

    return {
        ...getCommonEChartsConfig({
            title: queryTool.title,
            showLegend: metrics.length > 1,
            chartData,
            xAxisLabel: chartConfig?.xAxisLabel,
            yAxisLabel: chartConfig?.yAxisLabel,
            secondaryYAxisLabel: chartConfig?.secondaryYAxisLabel,
        }),
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
        yAxis: yAxisConfig,
        series: [
            ...metrics.map((metric) => ({
                type: 'bar' as const,
                yAxisIndex: 0,
                name: getSeriesName(metric),
                encode: {
                    x: xDimension,
                    y: metric,
                },
                ...(chartConfig?.stackBars ? { stack: 'stack' } : {}),
            })),
            ...secondaryMetrics.map((metric) => ({
                type: 'bar' as const,
                yAxisIndex: 1,
                name: getSeriesName(metric),
                encode: {
                    x: xDimension,
                    y: metric,
                },
                ...(chartConfig?.stackBars ? { stack: 'stack' } : {}),
            })),
        ],
    };
};
