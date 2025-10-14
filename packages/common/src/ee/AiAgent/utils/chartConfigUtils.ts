import type { ItemsMap } from '../../../types/field';
import { friendlyName, isField } from '../../../types/field';
import type { MetricQuery } from '../../../types/metricQuery';
import type {
    CartesianChartConfig,
    ChartConfig,
    FunnelChartConfig,
    PieChartConfig,
    PivotReference,
} from '../../../types/savedCharts';
import {
    CartesianSeriesType,
    ChartType,
    FunnelChartDataInput,
} from '../../../types/savedCharts';
import { formatItemValue } from '../../../utils/formatting';
import { getItemLabelWithoutTableName } from '../../../utils/item';
import type { ToolRunQueryArgsTransformed } from '../schemas/tools/toolRunQueryArgs';

// Axis type from echarts - defined inline since echarts is not a dependency of common
type Axis = {
    type?: 'category' | 'value' | 'time' | 'log';
    name?: string;
    [key: string]: unknown;
};

export type ChartTypeOption =
    | 'table'
    | 'bar'
    | 'horizontal'
    | 'line'
    | 'scatter'
    | 'pie'
    | 'funnel';

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
        case 'horizontal':
        case 'line':
        case 'scatter':
            // Charts require at least one dimension and one metric
            return (
                metricQuery.dimensions.length > 0 &&
                metricQuery.metrics.length > 0
            );
        case 'pie':
        case 'funnel':
            // Pie and funnel charts require at least one dimension and one metric
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
        types.push('bar', 'horizontal', 'line', 'scatter', 'pie', 'funnel');
    }

    return types;
};

export const formatFieldLabel = (
    fieldId: string,
    fieldsMap: ItemsMap,
): string => {
    const field = fieldsMap[fieldId];
    if (field && isField(field)) {
        return getItemLabelWithoutTableName(field);
    }
    return friendlyName(fieldId);
};

export const formatPivotValueLabel = (
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
 * Generates horizontal bar chart echarts config
 */
const getHorizontalBarChartConfig = ({
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
                        type: 'value',
                        ...(chartConfig?.xAxisLabel
                            ? { name: chartConfig.xAxisLabel }
                            : {}),
                    },
                ] as Axis[],
                yAxis: [
                    {
                        type: chartConfig?.xAxisType ?? 'category',
                        ...(chartConfig?.yAxisLabel
                            ? { name: chartConfig.yAxisLabel }
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
 * Generates scatter chart echarts config
 */
const getScatterChartConfig = ({
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
                        type: CartesianSeriesType.SCATTER,
                        yAxisIndex: 0,
                        // Scatter charts should show symbols by default
                        showSymbol: true,
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
 * Generates pie chart config
 */
const getPieChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
}): PieChartConfig => {
    const { dimensions } = queryTool.queryConfig;
    const { metrics } = metricQuery;

    const config: PieChartConfig['config'] = {
        groupFieldIds: dimensions,
        metricId: metrics[0] as string,
    };

    return {
        type: ChartType.PIE,
        config,
    };
};

/**
 * Generates funnel chart config
 */
const getFunnelChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
}): FunnelChartConfig => {
    const { metrics } = metricQuery;
    const { chartConfig } = queryTool;

    let dataInput = FunnelChartDataInput.COLUMN;
    if (chartConfig?.funnelDataInput === 'row') {
        dataInput = FunnelChartDataInput.ROW;
    }

    return {
        type: ChartType.FUNNEL,
        config: {
            fieldId: metrics[0] as string,
            dataInput,
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
    fieldsMap,
    overrideChartType,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
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
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'horizontal':
            return getHorizontalBarChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'line':
            return getLineChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'scatter':
            return getScatterChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'pie':
            return getPieChartConfig({
                queryTool,
                metricQuery,
            });

        case 'funnel':
            return getFunnelChartConfig({
                queryTool,
                metricQuery,
            });

        default:
            throw new Error(`Unknown chart type: ${chartType}`);
    }
};
