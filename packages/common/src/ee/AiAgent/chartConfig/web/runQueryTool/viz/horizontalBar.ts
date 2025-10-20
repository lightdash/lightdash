import { type ItemsMap } from '../../../../../../types/field';
import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    type CartesianChartConfig,
    CartesianSeriesType,
    ChartType,
} from '../../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';

export const getHorizontalBarChartConfig = ({
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

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: xDimension,
                yField: chartConfig?.yAxisMetrics || metricQuery.metrics,
                flipAxes: true, // This makes it horizontal
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
                yAxis: [
                    {
                        ...(chartConfig?.yAxisLabel
                            ? { name: chartConfig.yAxisLabel }
                            : {}),
                    },
                ],
                series: yMetrics.map((metric) => ({
                    type: CartesianSeriesType.BAR,
                    yAxisIndex: 0,
                    ...(chartConfig?.stackBars && {
                        stack: metric,
                    }),
                    encode: {
                        xRef: { field: xDimension },
                        yRef: { field: metric },
                    },
                    name: formatFieldLabel(metric, fieldsMap),
                })),
            },
        },
    };
};
