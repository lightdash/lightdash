import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    createMcpStructuredOutputSchema,
    mcpAsyncQueryUuidSchema,
    mcpQueryResultDoneMetricQueryResultSchema,
    mcpQueryResultDoneSqlResultSchema,
    mcpQueryResultTerminalResultSchema,
    mcpRunningQueryResultSchema,
} from './toolQueryResultSchemas';

export const TOOL_GET_QUERY_RESULT_DESCRIPTION = `Tool: get_query_result

Purpose:
Poll for the result of a long-running MCP query started by run_sql or run_metric_query.

Use this tool when run_sql or run_metric_query returns structuredContent.result.status = "running".
This tool waits up to 50 seconds for the query to complete before returning another running response.

Parameters:
- queryUuid: The async query UUID returned by run_sql or run_metric_query.

Response shape (MCP CallToolResult):
- Pending result: structuredContent.result contains { status: "running", queryUuid, nextPollAfterMs, heartbeatAt }. heartbeatAt means Lightdash checked recently and the query is still running.
- Completed SQL result: content contains CSV text and structuredContent.result contains { status: "done", queryUuid, rows, columns, rowCount }.
- Completed metric query result: content contains CSV text and structuredContent.result contains { status: "done", queryUuid, rows, fields }.
- Failed/cancelled/expired result: structuredContent.result contains { status, queryUuid, error }.

Notes:
- The warehouse execution timeout is the warehouse connection timeout configured in Lightdash, not an MCP-specific timeout.
`;

export const toolGetQueryResultArgsSchema = createToolSchema()
    .extend({
        queryUuid: mcpAsyncQueryUuidSchema.describe(
            'Async query UUID returned by run_sql or run_metric_query.',
        ),
    })
    .build();

export const mcpGetQueryResultStructuredOutputSchema =
    createMcpStructuredOutputSchema(
        z.union([
            mcpRunningQueryResultSchema,
            mcpQueryResultDoneSqlResultSchema,
            mcpQueryResultDoneMetricQueryResultSchema,
            mcpQueryResultTerminalResultSchema,
        ]),
    );

export type ToolGetQueryResultArgs = z.infer<
    typeof toolGetQueryResultArgsSchema
>;
