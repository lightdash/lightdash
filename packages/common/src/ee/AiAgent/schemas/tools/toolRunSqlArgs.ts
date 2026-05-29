import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    createMcpStructuredOutputSchema,
    mcpRunningQueryResultSchema,
    mcpSqlQueryCompletedResultSchema,
} from './toolQueryResultSchemas';

export const DEFAULT_RUN_SQL_LIMIT = 500;
export const DEFAULT_RUN_SQL_MAX_LIMIT = 5000;

export const buildRunSqlDescription = (
    defaultLimit: number,
    maxLimit: number,
) => `Tool: run_sql

Purpose:
Execute an arbitrary SQL query against the project's data warehouse and return the results. Successful results can be linked from the final answer with [Open in SQL Runner](#sql-runner-link).

Use this tool when the user wants to run a custom SQL query that doesn't fit the explore-based metric query model.
This is useful for ad-hoc analysis, data exploration, or queries that join across tables not modeled in explores.

The query is executed directly against the warehouse, so use the SQL dialect appropriate for the connected warehouse (e.g., PostgreSQL, BigQuery, Snowflake, etc.).

Parameters:
- sql: The SQL query to execute. Must be a valid SELECT statement.
- limit: Maximum number of rows to return (default ${defaultLimit}, max ${maxLimit}).

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<CSV string>" }] — header row + data rows, comma-separated. Provided for human/LLM display and as a fallback.
- If the query finishes quickly, structuredContent: {
    result: {
      status: "done",
      rows:     Array<Record<string, unknown>>,  // each row keyed by column name
      columns:  string[],                        // column names in order
      rowCount: number                           // total rows returned
    }
  }
- If the query is still running, structuredContent: {
    result: {
      status: "running",
      queryUuid: string,
      nextPollAfterMs: number,
      heartbeatAt: string
    }
  }
  Use get_query_result with this queryUuid to poll until the query is done.
  Each run_sql and get_query_result call can wait up to 50 seconds before returning a running response.

When writing code that consumes this tool (e.g. inside a live artifact), prefer structuredContent.result.rows over parsing the CSV. Example:

  const result = await callMcpTool('run_sql', { sql, limit });
  const rows    = result.structuredContent.result.rows;     // [{ status: 'completed', n: 94, total_amount: 2397 }, ...]
  const columns = result.structuredContent.result.columns;  // ['status', 'n', 'total_amount']

Notes:
- Values in rows are JSON-serializable primitives: numbers, strings, booleans, ISO date strings, or null. They are NOT pre-stringified — there's no need for parseFloat / parseInt on numeric columns.
- Empty results still return structuredContent.result with { status: "done", rows: [], columns, rowCount: 0 } — distinct from a parse failure.
- The warehouse execution timeout is the warehouse connection timeout configured in Lightdash, not an MCP-specific timeout.
- On error, the response has isError: true and content[0].text contains the error message; structuredContent is omitted.
`;

type CreateToolRunSqlArgsSchemaOptions = {
    maxLimit?: number;
    defaultLimit?: number;
};

export const createToolRunSqlArgsSchema = ({
    maxLimit = DEFAULT_RUN_SQL_MAX_LIMIT,
    defaultLimit = DEFAULT_RUN_SQL_LIMIT,
}: CreateToolRunSqlArgsSchemaOptions = {}) =>
    createToolSchema()
        .extend({
            sql: z
                .string()
                .describe(
                    'The SQL query to execute against the data warehouse.',
                ),
            limit: z
                .number()
                .int()
                .positive()
                .max(maxLimit)
                .default(defaultLimit)
                .describe(
                    `Maximum number of rows to return. Defaults to ${defaultLimit}, max ${maxLimit}.`,
                ),
        })
        .build();

export const toolRunSqlArgsSchema = createToolRunSqlArgsSchema();

export const toolRunSqlOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error', 'rejected', 'timeout']),
    }),
});

export const mcpRunSqlStructuredOutputSchema = createMcpStructuredOutputSchema(
    z.discriminatedUnion('status', [
        mcpSqlQueryCompletedResultSchema,
        mcpRunningQueryResultSchema,
    ]),
);

export type ToolRunSqlArgs = z.infer<typeof toolRunSqlArgsSchema>;
export type ToolRunSqlOutput = z.infer<typeof toolRunSqlOutputSchema>;
