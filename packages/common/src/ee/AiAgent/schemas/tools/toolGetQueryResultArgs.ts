import { type z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    MCP_GET_QUERY_RESULT_RESPONSE_DESCRIPTION,
    MCP_QUERY_COMMON_NOTES,
} from './toolMcpQueryResultDescription';
import { mcpAsyncQueryUuidSchema } from './toolQueryResultSchemas';

export const TOOL_GET_QUERY_RESULT_DESCRIPTION = `Poll for the result of a long-running MCP query started by run_sql or run_metric_query.

Use this tool when run_sql or run_metric_query returns a running result. Clients with structured output see this as structuredContent.result.status = "running"; text-only clients should extract the queryUuid from the content text.
Each call waits up to the MCP wait window before returning another running response.

Parameters:
- queryUuid: The async query UUID returned by run_sql or run_metric_query.

${MCP_GET_QUERY_RESULT_RESPONSE_DESCRIPTION}

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
