import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import {
    convertAiTableCalcsSchemaToTableCalcs,
    metricQueryTableViz,
    metricQueryTimeSeriesViz,
    metricQueryVerticalBarViz,
    toolRunQueryArgsSchemaTransformed,
    toolTableVizArgsSchemaTransformed,
    toolTimeSeriesArgsSchemaTransformed,
    toolVerticalBarArgsSchemaTransformed,
} from './schemas';
import { AiResultType } from './types';
import { getValidAiQueryLimit } from './validators';

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

    // Parse runQuery tool
    const toolRunQueryArgsParsed =
        toolRunQueryArgsSchemaTransformed.safeParse(vizConfigUnknown);
    if (toolRunQueryArgsParsed.success) {
        const vizTool = toolRunQueryArgsParsed.data;

        const metricQuery = {
            exploreName: vizTool.queryConfig.exploreName,
            dimensions: vizTool.queryConfig.dimensions,
            metrics: vizTool.queryConfig.metrics,
            sorts: vizTool.queryConfig.sorts.map((sort) => ({
                ...sort,
                nullsFirst: sort.nullsFirst ?? undefined,
            })),
            limit: getValidAiQueryLimit(
                vizTool.queryConfig.limit,
                maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
            ),
            filters: vizTool.filters,
            additionalMetrics: vizTool.customMetrics ?? [],
            tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                vizTool.tableCalculations,
            ),
        };

        return {
            type: AiResultType.QUERY_RESULT,
            vizTool,
            metricQuery,
        } as const;
    }

    return null;
};
