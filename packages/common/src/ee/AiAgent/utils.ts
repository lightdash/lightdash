import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import {
    convertAiTableCalcsSchemaToTableCalcs,
    metricQueryTableViz,
    metricQueryTimeSeriesViz,
    metricQueryVerticalBarViz,
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
        const metricQuery = metricQueryVerticalBarViz({
            vizConfig: vizTool.vizConfig,
            filters: vizTool.filters,
            maxLimit: maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
            customMetrics: vizTool.customMetrics ?? null,
            tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                vizTool.tableCalculations,
            ),
        });
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
        const metricQuery = metricQueryTimeSeriesViz({
            vizConfig: vizTool.vizConfig,
            filters: vizTool.filters,
            maxLimit: maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
            customMetrics: vizTool.customMetrics ?? null,
            tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                vizTool.tableCalculations,
            ),
        });
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
        const metricQuery = metricQueryTableViz({
            vizConfig: vizTool.vizConfig,
            filters: vizTool.filters,
            maxLimit: maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
            customMetrics: vizTool.customMetrics ?? null,
            tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                vizTool.tableCalculations,
            ),
        });
        return {
            type: AiResultType.TABLE_RESULT,
            vizTool,
            metricQuery,
        } as const;
    }

    return null;
};
