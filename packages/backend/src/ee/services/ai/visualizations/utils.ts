import { AiChartType, UnexpectedServerError } from '@lightdash/common';
import {
    isTableVizConfigTool,
    metricQueryTableViz,
    tableVizToolSchema,
} from './tableViz';
import {
    isTimeSeriesVizTool,
    metricQueryTimeSeriesChartMetric,
    timeSeriesVizToolSchema,
} from './timeSeriesViz';
import {
    isVerticalBarVizTool,
    metricQueryVerticalBarChartMetric,
    verticalBarVizToolSchema,
} from './verticalBarViz';

// TODO: this folder should be refactored and each visualization type should be a class extending a base class
// that has the common methods and properties
// this method will not be needed anymore

export const parseVizConfig = (
    vizConfigUnknown: object | null,
    maxLimit: number,
) => {
    if (!vizConfigUnknown) {
        return null;
    }

    if (isVerticalBarVizTool(vizConfigUnknown)) {
        const vizTool = verticalBarVizToolSchema
            .omit({ type: true, followUpTools: true })
            .parse(vizConfigUnknown);
        const metricQuery = metricQueryVerticalBarChartMetric(vizTool);
        return {
            type: AiChartType.VERTICAL_BAR_CHART,
            vizTool,
            metricQuery,
        } as const;
    }
    if (isTimeSeriesVizTool(vizConfigUnknown)) {
        const vizTool = timeSeriesVizToolSchema
            .omit({ type: true, followUpTools: true })
            .parse(vizConfigUnknown);
        const metricQuery = metricQueryTimeSeriesChartMetric(vizTool);
        return {
            type: AiChartType.TIME_SERIES_CHART,
            vizTool,
            metricQuery,
        } as const;
    }
    if (isTableVizConfigTool(vizConfigUnknown)) {
        const vizTool = tableVizToolSchema
            .omit({ type: true, followUpTools: true })
            .parse(vizConfigUnknown);
        const metricQuery = metricQueryTableViz(vizTool, maxLimit);
        return {
            type: AiChartType.TABLE,
            vizTool,
            metricQuery,
        } as const;
    }

    return null;
};
