import {
    AiChartType,
    assertUnreachable,
    type AnyType,
} from '@lightdash/common';

// TODO :: use schemas from AiAgent to infer types for configs
const getVerticalBarMetricEchartsConfig = (
    config: AnyType,
    rows: Record<string, unknown>[],
) => {
    let chartData = rows;
    let metrics = config.yMetrics;
    // if (config.breakdownByDimension) {
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
    const fields = Object.keys(chartData[0] || {});
    return {
        dataset: {
            source: chartData,
            dimensions: fields,
        },
        ...(config.title ? { title: { text: config.title } } : {}),
        animation: false,
        backgroundColor: '#fff',
        ...(metrics.length > 1
            ? {
                  // This is needed so we don't have overlapping legend and grid
                  legend: {
                      top: 40,
                      left: 'left',
                  },
                  grid: {
                      top: 100,
                  },
              }
            : {}),
        xAxis: [
            {
                type: config.xAxisType,
                ...(config.xAxisLabel ? { name: config.xAxisLabel } : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(config.yAxisLabel ? { name: config.yAxisLabel } : {}),
            },
        ],
        series: metrics.map((metric: AnyType) => ({
            type: 'bar',
            name: metric,
            encode: {
                x: config.xDimension,
                y: metric,
            },
            ...(config.stackBars ? { stack: config.breakdownByDimension } : {}),
        })),
    };
};

const getTimeSeriesMetricEchartsConfig = (
    config: AnyType,
    rows: Record<string, unknown>[],
) => {
    let chartData = rows;
    let metrics = config.yMetrics;
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
        ...(config.title ? { title: { text: config.title } } : {}),
        ...(metrics.length > 1
            ? {
                  // This is needed so we don't have overlapping legend and grid
                  legend: {
                      top: 40,
                      left: 'left',
                  },
                  grid: {
                      top: 100,
                  },
              }
            : {}),
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        animation: false,
        backgroundColor: '#fff',
        xAxis: [
            {
                type: 'time',
            },
        ],
        yAxis: [
            {
                type: 'value',
            },
        ],
        series: metrics.map((metric: AnyType) => ({
            type: 'line',
            name: metric,
            encode: {
                x: config.xDimension,
                y: metric,
            },
            ...(config.lineType === 'area' && { areaStyle: {} }),
        })),
    };
};

const getCsvMetricEchartsConfig = (
    _config: AnyType,
    _rows: Record<string, unknown>[],
) => {
    return {};
};

export const getChartOptionsFromAiAgentThreadMessageVizQuery = ({
    config,
    rows,
    type,
}: {
    config: AnyType;
    rows: Record<string, unknown>[];
    type: AiChartType;
}) => {
    switch (type) {
        case AiChartType.VERTICAL_BAR_CHART:
            return getVerticalBarMetricEchartsConfig(config, rows);
        case AiChartType.TIME_SERIES_CHART:
            return getTimeSeriesMetricEchartsConfig(config, rows);
        case AiChartType.CSV:
            return getCsvMetricEchartsConfig(config, rows);
        default:
            throw assertUnreachable(type, 'Invalid chart type');
    }
};
