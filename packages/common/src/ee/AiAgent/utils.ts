import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import {
    isToolOneLineArgs,
    isToolTableVizArgs,
    isToolTimeSeriesArgs,
    isToolVerticalBarArgs,
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

    if (isToolVerticalBarArgs(vizConfigUnknown)) {
        const vizTool =
            toolVerticalBarArgsSchemaTransformed.parse(vizConfigUnknown);
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
    if (isToolTimeSeriesArgs(vizConfigUnknown)) {
        const vizTool =
            toolTimeSeriesArgsSchemaTransformed.parse(vizConfigUnknown);
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
    if (isToolTableVizArgs(vizConfigUnknown)) {
        const vizTool =
            toolTableVizArgsSchemaTransformed.parse(vizConfigUnknown);
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

    if (isToolOneLineArgs(vizConfigUnknown)) {
        const vizTool =
            toolOneLineArgsSchemaTransformed.parse(vizConfigUnknown);
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
