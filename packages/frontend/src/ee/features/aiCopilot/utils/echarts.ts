import {
    AiChartType,
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    type ChartConfig,
    type CsvFileVizConfigSchemaType,
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

const getCsvMetricEchartsConfig = (
    _config: CsvFileVizConfigSchemaType,
    _rows: Record<string, unknown>[],
): ChartConfig => {
    return {
        type: ChartType.TABLE,
    };
};

export const getChartConfigFromAiAgentVizConfig = ({
    config,
    rows,
    type,
    metricQuery,
}: {
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
} & (
    | {
          type: AiChartType.VERTICAL_BAR_CHART;
          config: VerticalBarMetricVizConfigSchemaType;
      }
    | {
          type: AiChartType.TIME_SERIES_CHART;
          config: TimeSeriesMetricVizConfigSchemaType;
      }
    | {
          type: AiChartType.CSV;
          config: CsvFileVizConfigSchemaType;
      }
)): ChartConfig => {
    switch (type) {
        case AiChartType.VERTICAL_BAR_CHART:
            return getVerticalBarMetricEchartsConfig(config, metricQuery, rows);
        case AiChartType.TIME_SERIES_CHART:
            return getTimeSeriesMetricEchartsConfig(config, metricQuery, rows);
        case AiChartType.CSV:
            return getCsvMetricEchartsConfig(config, rows);
        default:
            throw assertUnreachable(type, 'Invalid chart type');
    }
};
