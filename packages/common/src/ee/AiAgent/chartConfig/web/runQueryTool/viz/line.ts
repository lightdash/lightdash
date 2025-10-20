import { type ItemsMap } from '../../../../../../types/field';
import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    type CartesianChartConfig,
    CartesianSeriesType,
    ChartType,
} from '../../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';

export const getLineChartConfig = ({
    queryTool,
    metricQuery,
    fieldsMap,
    chartConfig,
    metadata,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'] | null | undefined;
    metadata: { title: string; description: string };
}): CartesianChartConfig => {
    const { dimensions, metrics } = queryTool.queryConfig;
    const xDimension = chartConfig?.xAxisDimension || dimensions[0];
    const yMetrics = chartConfig?.yAxisMetrics || metrics;
    const secondaryYAxisMetric = chartConfig?.secondaryYAxisMetric;

    // Build yAxis array based on whether secondary axis is specified
    const yAxisConfig = secondaryYAxisMetric
        ? [
              {
                  ...(chartConfig?.yAxisLabel
                      ? { name: chartConfig.yAxisLabel }
                      : {}),
              },
              {
                  ...(chartConfig?.secondaryYAxisLabel
                      ? { name: chartConfig.secondaryYAxisLabel }
                      : {}),
              },
          ]
        : [
              {
                  ...(chartConfig?.yAxisLabel
                      ? { name: chartConfig.yAxisLabel }
                      : {}),
              },
          ];

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: xDimension,
                yField: secondaryYAxisMetric
                    ? [
                          ...(chartConfig?.yAxisMetrics || metricQuery.metrics),
                          secondaryYAxisMetric,
                      ]
                    : chartConfig?.yAxisMetrics || metricQuery.metrics,
            },
            eChartsConfig: {
                ...(metadata.title ? { title: { text: metadata.title } } : {}),
                legend: {
                    show: true,
                    type: 'scroll',
                },
                grid: { containLabel: true },
                xAxis: [
                    {
                        ...(chartConfig?.xAxisLabel
                            ? { name: chartConfig.xAxisLabel }
                            : {}),
                    },
                ],
                yAxis: yAxisConfig,
                series: [
                    ...yMetrics.map((metric) => ({
                        type: CartesianSeriesType.LINE,
                        yAxisIndex: 0,
                        ...(chartConfig?.lineType === 'area' && {
                            areaStyle: {},
                        }),
                        name: formatFieldLabel(metric, fieldsMap),
                        encode: {
                            xRef: { field: xDimension },
                            yRef: { field: metric },
                        },
                        stack:
                            chartConfig?.lineType === 'area'
                                ? 'total'
                                : undefined,
                    })),
                    ...(secondaryYAxisMetric
                        ? [
                              {
                                  type: CartesianSeriesType.LINE,
                                  yAxisIndex: 1,
                                  ...(chartConfig?.lineType === 'area' && {
                                      areaStyle: {},
                                  }),
                                  name: formatFieldLabel(
                                      secondaryYAxisMetric,
                                      fieldsMap,
                                  ),
                                  encode: {
                                      xRef: { field: xDimension },
                                      yRef: { field: secondaryYAxisMetric },
                                  },
                                  stack:
                                      chartConfig?.lineType === 'area'
                                          ? 'total'
                                          : undefined,
                              },
                          ]
                        : []),
                ],
            },
        },
    };
};
