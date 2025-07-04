import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import {
    metricQueryTableViz,
    metricQueryTimeSeriesViz,
    metricQueryVerticalBarViz,
    toolOneLineArgsSchemaTransformed,
    toolTableVizArgsSchemaTransformed,
    toolTimeSeriesArgsSchemaTransformed,
    toolVerticalBarArgsSchemaTransformed,
} from './schemas';
import { AiResultType } from './types';

export const parseVizConfig = (
    vizConfigUnknown: object | null,
    maxLimit?: number | undefined,
) => {
    if (!vizConfigUnknown) {
        return null;
    }

    const toolVerticalBarArgsParsed =
        toolVerticalBarArgsSchemaTransformed.safeParse(vizConfigUnknown);
    if (toolVerticalBarArgsParsed.success) {
        const vizTool = toolVerticalBarArgsParsed.data;
        const metricQuery = metricQueryVerticalBarViz(
            vizTool.vizConfig,
            vizTool.filters,
            maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
        );
        return {
            type: AiResultType.VERTICAL_BAR_RESULT,
            vizTool,
            metricQuery,
        } as const;
    }

    const toolTimeSeriesArgsParsed =
        toolTimeSeriesArgsSchemaTransformed.safeParse(vizConfigUnknown);
    if (toolTimeSeriesArgsParsed.success) {
        const vizTool = toolTimeSeriesArgsParsed.data;
        const metricQuery = metricQueryTimeSeriesViz(
            vizTool.vizConfig,
            vizTool.filters,
            maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
        );
        return {
            type: AiResultType.TIME_SERIES_RESULT,
            vizTool,
            metricQuery,
        } as const;
    }

    const toolTableVizArgsParsed =
        toolTableVizArgsSchemaTransformed.safeParse(vizConfigUnknown);
    if (toolTableVizArgsParsed.success) {
        const vizTool = toolTableVizArgsParsed.data;
        const metricQuery = metricQueryTableViz(
            vizTool.vizConfig,
            vizTool.filters,
            maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
        );
        return {
            type: AiResultType.TABLE_RESULT,
            vizTool,
            metricQuery,
        } as const;
    }

    const toolOneLineArgsParsed =
        toolOneLineArgsSchemaTransformed.safeParse(vizConfigUnknown);
    if (toolOneLineArgsParsed.success) {
        const vizTool = toolOneLineArgsParsed.data;
        const metricQuery = {
            ...vizTool.metricQuery,
            filters: vizTool.filters,
        };
        return {
            type: AiResultType.ONE_LINE_RESULT,
            metricQuery,
        } as const;
    }

    return null;
};
