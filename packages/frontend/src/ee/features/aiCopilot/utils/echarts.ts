import {
    AiResultType,
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    parseVizConfig,
    type ChartConfig,
    type MetricQuery,
    type PivotReference,
    type ResultRow,
    type TableVizConfigSchemaType,
    type TimeSeriesMetricVizConfigSchemaType,
    type VerticalBarMetricVizConfigSchemaType,
} from '@lightdash/common';
import { type Axis } from 'echarts';
import { getPivotedData } from '../../../../hooks/plottedData/getPlottedData';

const getVerticalBarMetricEchartsConfig = (
    config: VerticalBarMetricVizConfigSchemaType,
    metricQuery: MetricQuery,
    rows: Record<string, unknown>[],
): ChartConfig => {
    let metrics: (string | PivotReference)[] = config.yMetrics;
    const dimensions = [
        config.xDimension,
        ...(config.breakdownByDimension ? [config.breakdownByDimension] : []),
    ];

    if (config.breakdownByDimension) {
        const pivot = getPivotedData(
            rows as ResultRow[],
            [config.breakdownByDimension],
            config.yMetrics.filter(
                (metric: string) => !dimensions.includes(metric),
            ),
            config.yMetrics.filter((metric: string) =>
                dimensions.includes(metric),
            ),
        );
        rows = pivot.rows;
        metrics = Object.values(pivot.rowKeyMap);
    }

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: metricQuery.dimensions[0],
                yField: metricQuery.metrics,
            },
            eChartsConfig: {
                ...(config.title ? { title: { text: config.title } } : {}),
                legend: {
                    show: true,
                    type: 'plain',
                },
                grid: { containLabel: true },
                xAxis: [
                    {
                        type: config.xAxisType,
                        ...(config.xAxisLabel
                            ? { name: config.xAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                yAxis: [
                    {
                        type: 'value',
                        ...(config.yAxisLabel
                            ? { name: config.yAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                series: metrics.map((metric) => {
                    const defaultProperties = {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                    };

                    if (typeof metric === 'string') {
                        return {
                            ...defaultProperties,
                            name: metric,
                            encode: {
                                xRef: { field: config.xDimension },
                                yRef: {
                                    field: metric,
                                },
                            },
                        };
                    } else {
                        return {
                            ...defaultProperties,
                            encode: {
                                xRef: { field: config.xDimension },
                                yRef: metric,
                            },
                            stack: metric.field,
                        };
                    }
                }),
            },
        },
    };
};

const getTimeSeriesMetricEchartsConfig = (
    config: TimeSeriesMetricVizConfigSchemaType,
    metricQuery: MetricQuery,
    _rows: Record<string, unknown>[],
): ChartConfig => {
    // TODO :: pivot for time series
    // if (config.breakdownByDimension) {
    //     // Sort the pivoted data
    //     const pivoted = await getPivotedResults(
    //         rows,
    //         fieldsMap,
    //         config.breakdownByDimension,
    //         config.yMetrics,
    //         sorts,
    //     );
    //     chartData = pivoted.results;
    //     metrics = pivoted.metrics;
    // }

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: metricQuery.dimensions[0],
                yField: metricQuery.metrics,
            },
            eChartsConfig: {
                ...(config.title ? { title: { text: config.title } } : {}),
                legend: {
                    show: true,
                    type: 'plain',
                },
                grid: { containLabel: true },
                xAxis: [
                    {
                        type: 'time',
                    },
                ] as Axis[],
                yAxis: [
                    {
                        type: 'value',
                    },
                ] as Axis[],
                series: config.yMetrics.map((metric) => {
                    return {
                        type: CartesianSeriesType.LINE,
                        name: metric,
                        encode: {
                            xRef: { field: config.xDimension },
                            yRef: { field: metric },
                        },
                        ...(config.lineType === 'area' && { areaStyle: {} }),
                        yAxisIndex: 0,
                    };
                }),
            },
        },
    };
};

const getTableMetricEchartsConfig = (
    _config: TableVizConfigSchemaType,
    _rows: Record<string, unknown>[],
): ChartConfig => {
    return {
        type: ChartType.TABLE,
    };
};

export const getChartConfigFromAiAgentVizConfig = ({
    vizConfigOutput,
    metricQuery,
    rows,
    maxQueryLimit,
}: {
    vizConfigOutput: object | null;
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
    maxQueryLimit?: number;
}): ChartConfig => {
    const parsedConfig = parseVizConfig(vizConfigOutput, maxQueryLimit);
    if (!parsedConfig) {
        throw new Error('Invalid viz config');
    }

    switch (parsedConfig.type) {
        case AiResultType.VERTICAL_BAR_RESULT:
            return getVerticalBarMetricEchartsConfig(
                parsedConfig.vizTool.vizConfig,
                metricQuery,
                rows,
            );
        case AiResultType.TIME_SERIES_RESULT:
            return getTimeSeriesMetricEchartsConfig(
                parsedConfig.vizTool.vizConfig,
                metricQuery,
                rows,
            );
        case AiResultType.TABLE_RESULT:
            return getTableMetricEchartsConfig(
                parsedConfig.vizTool.vizConfig,
                rows,
            );
        case AiResultType.ONE_LINE_RESULT:
            throw new Error('One line result does not have a visualization');
        default:
            return assertUnreachable(parsedConfig, 'Invalid chart type');
    }
};
