import type { ItemsMap } from '../../../types/field';
import { friendlyName, isField } from '../../../types/field';
import type { MetricQuery } from '../../../types/metricQuery';
import type { ResultRow } from '../../../types/results';
import type { ChartConfig, PivotReference } from '../../../types/savedCharts';
import { CartesianSeriesType, ChartType } from '../../../types/savedCharts';
import { formatItemValue } from '../../../utils/formatting';
import { getItemLabelWithoutTableName } from '../../../utils/item';
import { getPivotedData } from '../../../utils/pivotData';
import type { ToolRunQueryArgsTransformed } from '../schemas/tools/toolRunQueryArgs';

// Axis type from echarts - defined inline since echarts is not a dependency of common
type Axis = {
    type?: 'category' | 'value' | 'time' | 'log';
    name?: string;
    [key: string]: unknown;
};

export type ChartTypeOption = 'table' | 'bar' | 'line';

/**
 * Determines if a query can be rendered as a specific chart type
 */
export const canRenderAsChart = (
    chartType: ChartTypeOption,
    metricQuery: MetricQuery,
): boolean => {
    switch (chartType) {
        case 'table':
            return true; // Table can always render
        case 'bar':
        case 'line':
            // Charts require at least one dimension and one metric
            return (
                metricQuery.dimensions.length > 0 &&
                metricQuery.metrics.length > 0
            );
        default:
            return false;
    }
};

/**
 * Gets all available chart types for a query
 */
export const getAvailableChartTypes = (
    metricQuery: MetricQuery,
): ChartTypeOption[] => {
    const types: ChartTypeOption[] = ['table'];

    if (metricQuery.metrics.length > 0 && metricQuery.dimensions.length > 0) {
        types.push('bar', 'line');
    }

    return types;
};

// Helper functions
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

/**
 * Generates bar chart echarts config
 */
const getBarChartConfig = ({
    queryTool,
    metricQuery,
    rows,
    fieldsMap,
    chartConfig,
    metadata,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
    fieldsMap: ItemsMap;
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'] | null | undefined;
    metadata: { title: string; description: string };
}): ChartConfig => {
    const { dimensions } = queryTool.queryConfig;
    const xDimension = dimensions[0];

    const { metrics: queryMetrics } = metricQuery;
    let metrics: (string | PivotReference)[] = queryMetrics;

    // Determine if we should pivot based on chartConfig.pivot or auto-detect from dimensions
    const shouldPivot = chartConfig?.pivot ?? dimensions.length > 1;
    const breakdownDimension =
        shouldPivot && dimensions.length > 1 ? dimensions[1] : null;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (breakdownDimension) {
        const pivot = getPivotedData(
            rows as ResultRow[],
            [breakdownDimension],
            metricQuery.metrics,
            [], // No pivoted dimensions
        );
        metrics = Object.values(pivot.rowKeyMap);
    }

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: xDimension,
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
                        type: chartConfig?.xAxisType ?? 'category',
                        ...(chartConfig?.xAxisLabel
                            ? { name: chartConfig.xAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                yAxis: [
                    {
                        type: 'value',
                        ...(chartConfig?.yAxisLabel
                            ? { name: chartConfig.yAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                series: metrics.map((metric) => {
                    const defaultProperties = {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        // ...(chartConfig?.stackBars && { stack: 'total' }),
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
                        ...(chartConfig?.stackBars && {
                            stack: metric.field,
                        }),
                    };
                }),
            },
        },
    };
};

/**
 * Generates line chart echarts config
 */
const getLineChartConfig = ({
    queryTool,
    metricQuery,
    rows,
    fieldsMap,
    chartConfig,
    metadata,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
    fieldsMap: ItemsMap;
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'] | null | undefined;
    metadata: { title: string; description: string };
}): ChartConfig => {
    const { dimensions } = queryTool.queryConfig;
    const xDimension = dimensions[0];

    const { metrics: queryMetrics } = metricQuery;
    let metrics: (string | PivotReference)[] = queryMetrics;

    // Determine if we should pivot based on chartConfig.pivot or auto-detect from dimensions
    const shouldPivot = chartConfig?.pivot ?? dimensions.length > 1;
    const breakdownDimension =
        shouldPivot && dimensions.length > 1 ? dimensions[1] : null;

    // If we should pivot and have a breakdown dimension, pivot the data
    if (breakdownDimension) {
        const pivoted = getPivotedData(
            rows as ResultRow[],
            [breakdownDimension],
            metricQuery.metrics,
            [], // No pivoted dimensions
        );
        metrics = Object.values(pivoted.rowKeyMap);
    }

    return {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: xDimension,
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
                        ...(chartConfig?.xAxisLabel
                            ? { name: chartConfig.xAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                yAxis: [
                    {
                        type: 'value',
                        ...(chartConfig?.yAxisLabel
                            ? { name: chartConfig.yAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                series: metrics.map((metric) => {
                    const defaultProperties = {
                        type: CartesianSeriesType.LINE,
                        yAxisIndex: 0,
                        ...(chartConfig?.lineType === 'area' && {
                            areaStyle: {},
                        }),
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

/**
 * Converts runQuery tool result to echarts config
 * This is the main function used for chart type switching
 */
export const getChartConfigFromRunQuery = ({
    queryTool,
    metricQuery,
    rows,
    fieldsMap,
    overrideChartType,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
    fieldsMap: ItemsMap;
    overrideChartType?: ChartTypeOption;
}): ChartConfig => {
    const chartType =
        overrideChartType ?? queryTool.chartConfig?.defaultVizType ?? 'table';

    if (!canRenderAsChart(chartType, metricQuery)) {
        // Fallback to table if chart type is not valid
        return { type: ChartType.TABLE };
    }

    const { chartConfig } = queryTool;
    const metadata = {
        title: queryTool.title,
        description: queryTool.description,
    };

    switch (chartType) {
        case 'table':
            return { type: ChartType.TABLE };

        case 'bar':
            return getBarChartConfig({
                queryTool,
                metricQuery,
                rows,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'line':
            return getLineChartConfig({
                queryTool,
                metricQuery,
                rows,
                fieldsMap,
                chartConfig,
                metadata,
            });

        default:
            throw new Error(`Unknown chart type: ${chartType}`);
    }
};
