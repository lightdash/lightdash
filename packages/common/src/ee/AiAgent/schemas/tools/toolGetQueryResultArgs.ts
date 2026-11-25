import { type z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    buildMcpVisualizationFollowUpInstruction,
    MCP_ARTIFACT_INTEGRATION_NOTE,
    MCP_QUERY_ERROR_NOTE,
    MCP_QUERY_RESULT_USAGE_NOTE,
} from './toolMcpQueryResultDescription';
import { mcpAsyncQueryUuidSchema } from './toolQueryResultSchemas';

export const TOOL_GET_QUERY_RESULT_DESCRIPTION = `Poll an existing run_sql, run_metric_query or query node query until done, error, cancelled, or expired. Use the exact queryUuid returned by the query tool; never invent it. This tool retrieves results without rerunning the query.

${MCP_QUERY_RESULT_USAGE_NOTE}
${MCP_QUERY_ERROR_NOTE}

Returns the original query's data on completion. ${buildMcpVisualizationFollowUpInstruction('get_query_result')} SQL results cannot be rendered by render_chart.

${MCP_ARTIFACT_INTEGRATION_NOTE}`;

// The composer query path lists neither render_chart nor the classic query tools.
export const TOOL_GET_QUERY_RESULT_COMPOSER_DESCRIPTION = `Poll a query node's query until done, error, cancelled, or expired. Use the exact queryUuid a query result names; never invent it. This tool retrieves results without rerunning the query.

${MCP_QUERY_RESULT_USAGE_NOTE}
${MCP_QUERY_ERROR_NOTE}

Returns every row of the node's result on completion.

${MCP_ARTIFACT_INTEGRATION_NOTE}`;

export const toolGetQueryResultArgsSchema = createToolSchema()
    .extend({
        queryUuid: mcpAsyncQueryUuidSchema.describe(
            'Async query UUID returned by the query tool.',
        ),
    })
    .build();

export type ToolGetQueryResultArgs = z.infer<
    typeof toolGetQueryResultArgsSchema
>;
