import { AiChartType, UnexpectedServerError } from '@lightdash/common';
import {
    generateTableVizConfigToolSchema,
    isTableVizConfig,
    metricQueryTableViz,
} from './tableViz';
import {
    generateTimeSeriesVizConfigToolSchema,
    isTimeSeriesMetricChartConfig,
    metricQueryTimeSeriesChartMetric,
} from './timeSeriesChart';
import {
    generateBarVizConfigToolSchema,
    isVerticalBarMetricChartConfig,
    metricQueryVerticalBarChartMetric,
} from './verticalBarChart';

// TODO: this folder should be refactored and each visualization type should be a class extending a base class
// that has the common methods and properties
// this method will not be needed anymore

export const getMetricQueryFromVizConfig = (
    vizConfigUnknown: unknown,
    maxLimit: number,
) => {
    if (isVerticalBarMetricChartConfig(vizConfigUnknown)) {
        const vizConfig =
            generateBarVizConfigToolSchema.parse(vizConfigUnknown);
        const metricQuery = metricQueryVerticalBarChartMetric(vizConfig);
        return {
            type: AiChartType.VERTICAL_BAR_CHART,
            config: vizConfig,
            metricQuery,
        } as const;
    }
    if (isTimeSeriesMetricChartConfig(vizConfigUnknown)) {
        const vizConfig =
            generateTimeSeriesVizConfigToolSchema.parse(vizConfigUnknown);
        const metricQuery = metricQueryTimeSeriesChartMetric(vizConfig);
        return {
            type: AiChartType.TIME_SERIES_CHART,
            config: vizConfig,
            metricQuery,
        } as const;
    }
    if (isTableVizConfig(vizConfigUnknown)) {
        const vizConfig =
            generateTableVizConfigToolSchema.parse(vizConfigUnknown);
        const metricQuery = metricQueryTableViz(vizConfig, maxLimit);
        return {
            type: AiChartType.TABLE,
            config: vizConfig,
            metricQuery,
        } as const;
    }

    throw new UnexpectedServerError('Invalid chart type');
};
