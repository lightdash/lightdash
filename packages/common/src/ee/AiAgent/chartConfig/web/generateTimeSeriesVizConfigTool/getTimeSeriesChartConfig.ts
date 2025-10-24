import { type AiVizMetadata } from '..';
import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import {
    type CartesianChartConfig,
    CartesianSeriesType,
    ChartType,
} from '../../../../../types/savedCharts';
import { type TimeSeriesMetricVizConfigSchemaType } from '../../../schemas';
import { formatFieldLabel } from '../../shared/formatFieldLabel';

export const getTimeSeriesChartConfig = (
    config: TimeSeriesMetricVizConfigSchemaType,
    metricQuery: MetricQuery,
    metadata: AiVizMetadata,
    fieldsMap: ItemsMap,
): CartesianChartConfig => {
    const metrics: string[] = config.yMetrics;

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: metricQuery.dimensions[0],
                yField: metricQuery.metrics,
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
                        ...(config.xAxisLabel
                            ? { name: config.xAxisLabel }
                            : {}),
                    },
                ],
                yAxis: [
                    {
                        ...(config.yAxisLabel
                            ? { name: config.yAxisLabel }
                            : {}),
                    },
                ],
                series: metrics.map((metric) => ({
                    type: CartesianSeriesType.LINE,
                    yAxisIndex: 0,
                    ...(config.lineType === 'area' && { areaStyle: {} }),
                    name: formatFieldLabel(metric, fieldsMap),
                    encode: {
                        xRef: { field: config.xDimension },
                        yRef: { field: metric },
                    },
                })),
            },
        },
    };
};
