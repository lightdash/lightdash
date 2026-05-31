import { type z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    MCP_QUERY_COMMON_NOTES,
    MCP_QUERY_STRUCTURED_RUNNING_NOTE,
} from './toolMcpQueryResultDescription';
import { mcpAsyncQueryUuidSchema } from './toolQueryResultSchemas';

export const TOOL_GET_QUERY_RESULT_DESCRIPTION = `Tool: get_query_result

Purpose:
Poll for the result of a long-running MCP query started by run_sql or run_metric_query.

Use this tool when run_sql or run_metric_query returns a running result. Clients with structured output see this as structuredContent.result.status = "running"; text-only clients should extract the queryUuid from the content text.
This tool waits for the query to complete before returning another running response.

Parameters:
- queryUuid: The async query UUID returned by run_sql or run_metric_query.

Response shape (MCP CallToolResult):
- Pending result: structuredContent.result contains { status: "running", queryUuid, nextPollAfterMs, heartbeatAt }. ${MCP_QUERY_STRUCTURED_RUNNING_NOTE}
- Completed SQL result: content contains CSV text and structuredContent.result contains { status: "done", queryUuid, rows, columns, rowCount }.
- Completed metric query result: content contains bare CSV text and structuredContent.result contains { status: "done", queryUuid, rows, fields }.
- Failed/cancelled/expired result: structuredContent.result contains { status, queryUuid, error }.

Notes:
${MCP_QUERY_COMMON_NOTES}
`;

export const toolGetQueryResultArgsSchema = createToolSchema()
    .extend({
        queryUuid: mcpAsyncQueryUuidSchema.describe(
            'Async query UUID returned by run_sql or run_metric_query.',
        ),
    })
    .build();

export type ToolGetQueryResultArgs = z.infer<
    typeof toolGetQueryResultArgsSchema
>;
