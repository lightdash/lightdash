import type { AnyType, XAxis } from '@lightdash/common';
import {
    AiChartType,
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    type ChartConfig,
    type MetricQuery,
} from '@lightdash/common';
import { type Axis } from 'echarts';
import { type EChartSeries } from '../../../../hooks/echarts/useEchartsCartesianConfig';

export const getAiAgentChartConfig = ({
    type,
    chartOptions,
    metricQuery,
}: {
    type: AiChartType;
    chartOptions?: AnyType;
    metricQuery: MetricQuery;
}): ChartConfig => {
    let chartType: ChartType;
    switch (type) {
        case AiChartType.VERTICAL_BAR_CHART:
        case AiChartType.TIME_SERIES_CHART:
            chartType = ChartType.CARTESIAN;
            break;
        case AiChartType.CSV:
            chartType = ChartType.TABLE;
            break;
        default:
            return assertUnreachable(type, `Invalid chart type ${type}`);
    }

    if (chartType === ChartType.CARTESIAN && chartOptions && !!metricQuery) {
        // Extract configuration from AI data and convert to Lightdash format
        const echartsConfig = chartOptions;

        // Create proper Lightdash Series objects
        const lightdashSeries =
            ('series' in echartsConfig &&
            echartsConfig.series &&
            Array.isArray(echartsConfig.series)
                ? echartsConfig.series
                : []
            )?.map((echartSeries: EChartSeries) => {
                const yField = echartSeries.encode?.y || metricQuery.metrics[0];
                const xField =
                    echartSeries.encode?.x || metricQuery.dimensions[0];

                return {
                    type:
                        echartSeries.type === CartesianSeriesType.BAR
                            ? CartesianSeriesType.BAR
                            : echartSeries.type,
                    name: echartSeries.name || yField,
                    yAxisIndex: 0,
                    encode: {
                        xRef: { field: xField },
                        yRef: { field: yField },
                    },
                    stack: echartSeries.stack,
                };
            }) || [];

        // Create a basic layout from the metric query
        const layout = {
            xField: metricQuery.dimensions[0],
            yField: metricQuery.metrics,
        };

        return {
            type: ChartType.CARTESIAN,
            config: {
                layout,
                eChartsConfig: {
                    series: lightdashSeries,
                    xAxis:
                        'xAxis' in echartsConfig
                            ? (echartsConfig.xAxis as XAxis[])
                            : undefined,
                    yAxis:
                        'yAxis' in echartsConfig
                            ? (echartsConfig.yAxis as Axis[])
                            : undefined,
                    legend: {
                        show: true,
                        type: 'plain',
                    },
                    grid: { containLabel: true },
                },
            },
        };
    }

    return {
        type: ChartType.TABLE,
        config: {},
    };
};
