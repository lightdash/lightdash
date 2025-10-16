import { type ItemsMap } from '../../../../../../types/field';
import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    type CartesianChartConfig,
    CartesianSeriesType,
    ChartType,
} from '../../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { formatFieldLabel } from '../../../shared/formatFieldLabel';
import { formatPivotValueLabel } from '../../shared/formatPivotValueLabel';

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
    const xDimension = dimensions[0];

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: xDimension,
                yField: metricQuery.metrics,
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
                                xRef: { field: xDimension },
                                yRef: { field: metric },
                            },
                        };
                    }

                    return {
                        ...defaultProperties,
                        name: formatPivotValueLabel(metric, fieldsMap),
                        encode: {
                            xRef: { field: xDimension },
                            yRef: metric,
                        },
                    };
                }),
            },
        },
    };
};
