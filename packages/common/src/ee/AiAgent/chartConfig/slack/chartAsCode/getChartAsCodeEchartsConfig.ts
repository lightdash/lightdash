import { type EChartsOption } from 'echarts';
import { type ChartAsCode } from '../../../../../types/coder';
import {
    CartesianSeriesType,
    ChartType,
    type CartesianChart,
} from '../../../../../types/savedCharts';
import { getChartAsCodeMetricQuery } from '../../../chartAsCodeArtifact';
import { type ToolRunQueryArgsTransformed } from '../../../schemas';
import { getRunQueryEchartsConfig } from '../runQueryTool/getRunQueryEchartsConfig';
import { type GetPivotedResultsFn, type QueryResults } from '../types';

type SlackVizType = NonNullable<
    ToolRunQueryArgsTransformed['chartConfig']
>['defaultVizType'];

const getCartesianVizType = (
    cartesian: CartesianChart | undefined,
): SlackVizType | null => {
    const seriesType = cartesian?.eChartsConfig?.series?.[0]?.type;
    switch (seriesType) {
        case CartesianSeriesType.BAR:
            return cartesian?.layout?.flipAxes ? 'horizontal' : 'bar';
        case CartesianSeriesType.LINE:
        case CartesianSeriesType.AREA:
            return 'line';
        case CartesianSeriesType.SCATTER:
            return 'scatter';
        default:
            return null;
    }
};

/**
 * Derives the legacy Slack chart hints from a chart-as-code artifact so the
 * existing per-viz echarts builders can render it as an image. Returns null
 * chartConfig hints for chart types that are delivered as CSV (e.g. tables).
 */
const getSlackQueryToolHints = (
    chartAsCode: ChartAsCode,
    maxLimit?: number,
): ToolRunQueryArgsTransformed | null => {
    const metricQuery = getChartAsCodeMetricQuery(chartAsCode, maxLimit);
    const { chartConfig } = chartAsCode;

    let hints: NonNullable<ToolRunQueryArgsTransformed['chartConfig']> | null =
        null;

    const baseHints = {
        xAxisDimension: null,
        yAxisMetrics: null,
        groupBy: chartAsCode.pivotConfig?.columns ?? null,
        xAxisType: null,
        stackBars: null,
        lineType: null,
        funnelDataInput: null,
        xAxisLabel: '',
        yAxisLabel: '',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    };

    switch (chartConfig.type) {
        case ChartType.CARTESIAN: {
            const cartesian = chartConfig.config;
            const defaultVizType = getCartesianVizType(cartesian);
            if (!defaultVizType) {
                return null;
            }
            const series = cartesian?.eChartsConfig?.series ?? [];
            const secondaryYAxisSeries = series.find(
                (entry) => entry.yAxisIndex === 1,
            );
            hints = {
                ...baseHints,
                defaultVizType,
                xAxisDimension: cartesian?.layout?.xField ?? null,
                yAxisMetrics: cartesian?.layout?.yField ?? null,
                stackBars:
                    Boolean(cartesian?.layout?.stack) ||
                    series.some((entry) => entry.stack),
                lineType: series.some(
                    (entry) => entry.type === CartesianSeriesType.AREA,
                )
                    ? 'area'
                    : 'line',
                xAxisLabel: cartesian?.eChartsConfig?.xAxis?.[0]?.name ?? '',
                yAxisLabel: cartesian?.eChartsConfig?.yAxis?.[0]?.name ?? '',
                secondaryYAxisMetric:
                    secondaryYAxisSeries?.encode.yRef.field ?? null,
                secondaryYAxisLabel:
                    cartesian?.eChartsConfig?.yAxis?.[1]?.name ?? null,
            };
            break;
        }
        case ChartType.PIE:
            hints = {
                ...baseHints,
                defaultVizType: 'pie',
                yAxisMetrics: chartConfig.config?.metricId
                    ? [chartConfig.config.metricId]
                    : null,
            };
            break;
        case ChartType.FUNNEL:
            hints = {
                ...baseHints,
                defaultVizType: 'funnel',
                yAxisMetrics: chartConfig.config?.fieldId
                    ? [chartConfig.config.fieldId]
                    : null,
                funnelDataInput: chartConfig.config?.dataInput ?? null,
            };
            break;
        default:
            // Tables, big numbers and other types are delivered as CSV
            return null;
    }

    return {
        title: chartAsCode.name,
        description: chartAsCode.description ?? '',
        customMetrics: null,
        tableCalculations: null,
        filters: metricQuery.filters,
        queryConfig: {
            exploreName: metricQuery.exploreName,
            dimensions: metricQuery.dimensions,
            metrics: metricQuery.metrics,
            sorts: metricQuery.sorts.map((sort) => ({
                ...sort,
                nullsFirst: sort.nullsFirst ?? null,
            })),
            limit: metricQuery.limit,
        },
        chartConfig: hints,
    };
};

export const getChartAsCodeEchartsConfig = async ({
    chartAsCode,
    queryResults,
    getPivotedResults,
    maxLimit,
}: {
    chartAsCode: ChartAsCode;
    queryResults: QueryResults;
    getPivotedResults: GetPivotedResultsFn;
    maxLimit?: number;
}): Promise<EChartsOption | null> => {
    const queryToolHints = getSlackQueryToolHints(chartAsCode, maxLimit);
    if (!queryToolHints) {
        return null;
    }

    return getRunQueryEchartsConfig(
        queryToolHints,
        queryResults,
        getPivotedResults,
    );
};
