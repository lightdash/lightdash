import { type EChartsOption } from 'echarts';
import type { ToolRunQueryArgsTransformed } from '../../schemas';
import type { AiResultType } from '../../types';
import { getRunQueryEchartsConfig } from './runQueryTool/getRunQueryEchartsConfig';
import { type GetPivotedResultsFn, type QueryResults } from './types';

/**
 * Union type for all AI tool args that can generate echarts
 */
export type SlackAiToolArgs = {
    type: AiResultType.QUERY_RESULT;
    tool: ToolRunQueryArgsTransformed;
};

/**
 * Main function to generate echarts config for Slack AI agents
 *
 * @param toolArgs - Tool arguments with type
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

    return getRunQueryEchartsConfig(
        toolArgs.tool,
        queryResults,
        getPivotedResults,
    );
};
