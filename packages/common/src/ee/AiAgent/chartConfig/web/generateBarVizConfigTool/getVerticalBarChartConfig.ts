import { type AiVizMetadata } from '..';
import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import {
    type CartesianChartConfig,
    CartesianSeriesType,
    ChartType,
    type PivotReference,
} from '../../../../../types/savedCharts';
import { type VerticalBarMetricVizConfigSchemaType } from '../../../schemas';
import { formatFieldLabel } from '../../shared/formatFieldLabel';
import { formatPivotValueLabel } from '../shared/formatPivotValueLabel';

export const getVerticalBarChartConfig = (
    config: VerticalBarMetricVizConfigSchemaType,
    metricQuery: MetricQuery,
    metadata: AiVizMetadata,
    fieldsMap: ItemsMap,
): CartesianChartConfig => {
    const metrics: (string | PivotReference)[] = config.yMetrics;

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
                series: metrics.map((metric) => {
                    const defaultProperties = {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                    };

                    if (typeof metric === 'string') {
                        return {
                            ...defaultProperties,
                            name: formatFieldLabel(metric, fieldsMap),
                            encode: {
                                xRef: { field: config.xDimension },
                                yRef: {
                                    field: metric,
                                },
                            },
                        };
                    }
                    return {
                        ...defaultProperties,
                        name: formatPivotValueLabel(metric, fieldsMap),
                        encode: {
                            xRef: { field: config.xDimension },
                            yRef: metric,
                        },
                        stack: metric.field,
                    };
                }),
            },
        },
    };
};
