import {
    AiResultType,
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    formatItemValue,
    friendlyName,
    getChartConfigFromRunQuery,
    getItemLabelWithoutTableName,
    getPivotedData,
    isField,
    parseVizConfig,
    type AiVizMetadata,
    type ChartConfig,
    type ItemsMap,
    type MetricQuery,
    type PivotReference,
    type ResultRow,
    type TimeSeriesMetricVizConfigSchemaType,
    type ToolRunQueryArgs,
    type ToolTableVizArgs,
    type ToolTimeSeriesArgs,
    type ToolVerticalBarArgs,
    type VerticalBarMetricVizConfigSchemaType,
} from '@lightdash/common';
import { type Axis } from 'echarts';

const formatFieldLabel = (fieldId: string, fieldsMap: ItemsMap): string => {
    const field = fieldsMap[fieldId];
    if (field && isField(field)) {
        return getItemLabelWithoutTableName(field);
    }
    return friendlyName(fieldId);
};

const formatPivotValueLabel = (
    pivotReference: PivotReference,
    fieldsMap: ItemsMap,
): string => {
    if (!pivotReference.pivotValues?.[0]) {
        return '';
    }

    const pivotFieldId = pivotReference.pivotValues[0].field;
    const pivotField = fieldsMap[pivotFieldId];
    const pivotValue = pivotReference.pivotValues[0].value;

    if (pivotField && isField(pivotField)) {
        return formatItemValue(pivotField, pivotValue);
    }

    return friendlyName(String(pivotValue));
};

const getVerticalBarMetricEchartsConfig = (
    config: VerticalBarMetricVizConfigSchemaType,
    metricQuery: MetricQuery,
    rows: Record<string, unknown>[],
    metadata: AiVizMetadata,
    fieldsMap: ItemsMap,
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
                            name: formatFieldLabel(metric, fieldsMap),
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
                            name: formatPivotValueLabel(metric, fieldsMap),
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
    fieldsMap: ItemsMap,
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
                            name: formatFieldLabel(metric, fieldsMap),
                            encode: {
                                xRef: { field: config.xDimension },
                                yRef: { field: metric },
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
    vizConfig,
    metricQuery,
    rows,
    maxQueryLimit,
    fieldsMap,
    overrideChartType,
}: {
    vizConfig:
        | ToolTableVizArgs
        | ToolTimeSeriesArgs
        | ToolVerticalBarArgs
        | ToolRunQueryArgs;
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
    maxQueryLimit?: number;
    fieldsMap: ItemsMap;
    overrideChartType?:
        | 'table'
        | 'bar'
        | 'horizontal'
        | 'line'
        | 'scatter'
        | 'pie'
        | 'funnel';
}) => {
    const parsedConfig = parseVizConfig(vizConfig, maxQueryLimit);
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
                    fieldsMap,
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
                    fieldsMap,
                ),
            };
        case AiResultType.TABLE_RESULT:
            return {
                ...parsedConfig,
                echartsConfig: getTableMetricEchartsConfig(),
            };
        case AiResultType.QUERY_RESULT:
            return {
                type: parsedConfig.type,
                vizTool: parsedConfig.vizTool,
                metricQuery: parsedConfig.metricQuery,
                echartsConfig: getChartConfigFromRunQuery({
                    queryTool: parsedConfig.vizTool,
                    metricQuery,
                    fieldsMap,
                    overrideChartType,
                }),
            };
        default:
            return assertUnreachable(parsedConfig, 'Invalid chart type');
    }
};
