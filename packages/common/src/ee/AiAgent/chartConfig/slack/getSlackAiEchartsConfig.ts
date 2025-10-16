import { type EChartsOption } from 'echarts';
import { type SortField } from '../../../../types/metricQuery';
import {
    type ToolRunQueryArgsTransformed,
    type ToolTableVizArgsTransformed,
    type ToolTimeSeriesArgsTransformed,
    type ToolVerticalBarArgsTransformed,
} from '../../schemas';
import { AiResultType } from '../../types';
import { getVerticalBarChartEchartsConfig } from './generateBarVizConfigTool/getVerticalBarChartEchartsConfig';
import { getTimeSeriesChartEchartsConfig } from './generateTimeSeriesVizConfigTool/getTimeSeriesChartEchartsConfig';
import { getRunQueryEchartsConfig } from './runQueryTool/getRunQueryEchartsConfig';
import { type GetPivotedResultsFn, type QueryResults } from './types';

/**
 * Union type for all AI tool args that can generate echarts
 */
export type SlackAiToolArgs =
    | {
          type: typeof AiResultType.QUERY_RESULT;
          tool: ToolRunQueryArgsTransformed;
      }
    | {
          type: typeof AiResultType.TIME_SERIES_RESULT;
          tool: ToolTimeSeriesArgsTransformed;
      }
    | {
          type: typeof AiResultType.VERTICAL_BAR_RESULT;
          tool: ToolVerticalBarArgsTransformed;
      }
    | {
          type: typeof AiResultType.TABLE_RESULT;
          tool: ToolTableVizArgsTransformed;
      };

/**
 * Main function to generate echarts config for Slack AI agents
 * Decides which specific echarts config function to use based on the tool type
 *
 * @param toolArgs - Discriminated union of tool arguments with type
 * @param queryResults - Query results from running the query
 * @param getPivotedResults - Function to pivot data (backend dependency)
 * @returns EChartsOption | null
 */
export const getSlackAiEchartsConfig = async ({
    toolArgs,
    queryResults,
    getPivotedResults,
}: {
    toolArgs: SlackAiToolArgs;
    queryResults: QueryResults;
    getPivotedResults: GetPivotedResultsFn;
}): Promise<EChartsOption | null> => {
    // Empty data - don't render
    if (queryResults.rows.length === 0) {
        return null;
    }

    switch (toolArgs.type) {
        case AiResultType.QUERY_RESULT:
            return getRunQueryEchartsConfig(
                toolArgs.tool,
                queryResults,
                getPivotedResults,
            );

        case AiResultType.TIME_SERIES_RESULT:
            return getTimeSeriesChartEchartsConfig(
                toolArgs.tool,
                queryResults.rows,
                queryResults.fields,
                toolArgs.tool.vizConfig.sorts as SortField[],
                getPivotedResults,
            );

        case AiResultType.VERTICAL_BAR_RESULT:
            return getVerticalBarChartEchartsConfig(
                toolArgs.tool,
                queryResults.rows,
                queryResults.fields,
                toolArgs.tool.vizConfig.sorts as SortField[],
                getPivotedResults,
            );

        case AiResultType.TABLE_RESULT:
            // Tables don't render as echarts images
            return null;

        default:
            return null;
    }
};
