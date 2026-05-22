import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import {
    convertAiTableCalcsSchemaToTableCalcs,
    filterAggregationCustomMetrics,
    metricQueryTableViz,
    metricQueryTimeSeriesViz,
    metricQueryVerticalBarViz,
    ToolDefinitions,
} from './schemas';
import { AiResultType } from './types';
import { getValidAiQueryLimit } from './validators';

const agentTools = ToolDefinitions.for('agent');

export const parseVizConfig = (
    vizConfigUnknown: object | null,
    maxLimit?: number | undefined,
) => {
    if (!vizConfigUnknown) {
        return null;
    }

    const verticalBarVizToolParsed =
        agentTools.generateBarVizConfig.safeParseInput(vizConfigUnknown);
    if (verticalBarVizToolParsed.success) {
        const vizTool = verticalBarVizToolParsed.data;
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

    const timeSeriesVizToolParsed =
        agentTools.generateTimeSeriesVizConfig.safeParseInput(vizConfigUnknown);
    if (timeSeriesVizToolParsed.success) {
        const vizTool = timeSeriesVizToolParsed.data;
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

    const tableVizToolParsed =
        agentTools.generateTableVizConfig.safeParseInput(vizConfigUnknown);
    if (tableVizToolParsed.success) {
        const vizTool = tableVizToolParsed.data;
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

    const runQueryToolParsed =
        agentTools.runQuery.safeParseInput(vizConfigUnknown);
    if (runQueryToolParsed.success) {
        const vizTool = runQueryToolParsed.data;

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
            additionalMetrics: filterAggregationCustomMetrics(
                vizTool.customMetrics,
            ),
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
