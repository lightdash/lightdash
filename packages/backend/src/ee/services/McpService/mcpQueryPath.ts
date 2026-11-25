import { assertUnreachable, type AiAgent } from '@lightdash/common';

/** How an MCP session runs queries; decides its query tools and instructions. */
export type McpQueryPath =
    | { type: 'contentOnly' }
    | { type: 'sqlOnly' }
    | {
          type: 'classic';
          sqlRunnerEnabled: boolean;
          filterExpressionsEnabled: boolean;
      }
    | { type: 'composer'; sqlRunnerEnabled: boolean };

export type McpQueryTools = {
    /** list_explores, grep_fields, get_metadata, search_field_values */
    discovery: boolean;
    /** run_metric_query, render_chart and the custom chart frame */
    runMetricQuery: boolean;
    runSql: boolean;
    query: boolean;
    filterExpressionsEnabled: boolean;
};

export const getMcpQueryTools = (queryPath: McpQueryPath): McpQueryTools => {
    switch (queryPath.type) {
        case 'contentOnly':
            return {
                discovery: false,
                runMetricQuery: false,
                runSql: false,
                query: false,
                filterExpressionsEnabled: false,
            };
        case 'sqlOnly':
            return {
                discovery: false,
                runMetricQuery: false,
                runSql: true,
                query: false,
                filterExpressionsEnabled: false,
            };
        case 'classic':
            return {
                discovery: true,
                runMetricQuery: true,
                runSql: queryPath.sqlRunnerEnabled,
                query: false,
                filterExpressionsEnabled: queryPath.filterExpressionsEnabled,
            };
        // semanticLayer node filters are always expressions
        case 'composer':
            return {
                discovery: true,
                runMetricQuery: false,
                runSql: false,
                query: true,
                filterExpressionsEnabled: true,
            };
        default:
            return assertUnreachable(queryPath, 'Unknown MCP query path');
    }
};

export type McpComposerAgentSettings = Pick<
    AiAgent,
    'enableDataAccess' | 'enableComposerQueries'
>;

/** No pinned agent, or one with data access and composer queries on. */
export const agentAllowsComposerQueries = (
    agent: McpComposerAgentSettings | null,
): boolean => !agent || (agent.enableDataAccess && agent.enableComposerQueries);
