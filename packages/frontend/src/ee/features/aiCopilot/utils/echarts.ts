import {
    AiResultType,
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    parseVizConfig,
    type AiVizMetadata,
    type ChartConfig,
    type MetricQuery,
    type PivotReference,
    type ResultRow,
    type TimeSeriesMetricVizConfigSchemaType,
    type VerticalBarMetricVizConfigSchemaType,
} from '@lightdash/common';
import { type Axis } from 'echarts';
import { getPivotedData } from '../../../../hooks/plottedData/getPlottedData';

const getVerticalBarMetricEchartsConfig = (
    config: VerticalBarMetricVizConfigSchemaType,
    metricQuery: MetricQuery,
    rows: Record<string, unknown>[],
    metadata: AiVizMetadata,
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
                ...(metadata.title ? { title: { text: metadata.title } } : {}),
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
    rows: Record<string, unknown>[],
    metadata: AiVizMetadata,
): ChartConfig => {
    let metrics: (string | PivotReference)[] = config.yMetrics;
    const dimensions = [
        config.xDimension,
        ...(config.breakdownByDimension ? [config.breakdownByDimension] : []),
    ];

    if (config.breakdownByDimension) {
        // Sort the pivoted data
        const pivoted = getPivotedData(
            rows as ResultRow[],
            [config.breakdownByDimension],
            config.yMetrics.filter(
                (metric: string) => !dimensions.includes(metric),
            ),
            config.yMetrics.filter((metric: string) =>
                dimensions.includes(metric),
            ),
        );
        rows = pivoted.rows;
        metrics = Object.values(pivoted.rowKeyMap);
    }

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
                    type: 'plain',
                },
                grid: { containLabel: true },
                xAxis: [
                    {
                        type: 'time',
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
                        type: CartesianSeriesType.LINE,
                        yAxisIndex: 0,
                        ...(config.lineType === 'area' && { areaStyle: {} }),
                    };

                    if (typeof metric === 'string') {
                        return {
                            ...defaultProperties,
                            // TODO we can use fieldMap to get the user-friendly label
                            name: metric,
                            encode: {
                                xRef: { field: config.xDimension },
                                yRef: { field: metric },
                            },
                        };
                    }

                    return {
                        ...defaultProperties,
                        // TODO we can use fieldMap to get the label for the pivot value
                        // name: String(metric.pivotValues?.[0]?.value),
                        encode: {
                            xRef: { field: config.xDimension },
                            yRef: metric,
                        },
                    };
                }),
            },
        },
    };
};

const getTableMetricEchartsConfig = (): ChartConfig => ({
    type: ChartType.TABLE,
});

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
}) => {
    const parsedConfig = parseVizConfig(vizConfigOutput, maxQueryLimit);
    if (!parsedConfig) {
        throw new Error('Invalid viz config');
    }

    switch (parsedConfig.type) {
        case AiResultType.VERTICAL_BAR_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getVerticalBarMetricEchartsConfig(
                    parsedConfig.vizTool.vizConfig,
                    metricQuery,
                    rows,
                    {
                        title: parsedConfig.vizTool.title,
                        description: parsedConfig.vizTool.description,
                    },
                ),
            };
        case AiResultType.TIME_SERIES_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getTimeSeriesMetricEchartsConfig(
                    parsedConfig.vizTool.vizConfig,
                    metricQuery,
                    rows,
                    {
                        title: parsedConfig.vizTool.title,
                        description: parsedConfig.vizTool.description,
                    },
                ),
            };
        case AiResultType.TABLE_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getTableMetricEchartsConfig(),
            };
        default:
            return assertUnreachable(parsedConfig, 'Invalid chart type');
    }
};
