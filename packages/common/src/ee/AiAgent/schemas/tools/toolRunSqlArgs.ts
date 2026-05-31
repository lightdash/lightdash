import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    buildMcpQueryRunResponseDescription,
    MCP_QUERY_COMMON_NOTES,
} from './toolMcpQueryResultDescription';

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

${buildMcpQueryRunResponseDescription({
    contentDescription:
        'header row + data rows, comma-separated. Empty results return prose text like "Query returned 0 rows.".',
    completedResultShape: `    result: {
      status: "done",
      rows:     Array<Record<string, unknown>>,  // each row keyed by column name
      columns:  string[],                        // column names in order
      rowCount: number                           // total rows returned
    }`,
})}

When writing code that consumes this tool (e.g. inside a live artifact), prefer structuredContent.result.rows when available. Example:

  const result = await callMcpTool('run_sql', { sql, limit });
  const rows    = result.structuredContent.result.rows;     // [{ order_id: 94, total_amount: 2397 }, ...]
  const columns = result.structuredContent.result.columns;  // ['order_id', 'total_amount']

Notes:
${MCP_QUERY_COMMON_NOTES}
- Values in rows are JSON-serializable primitives: numbers, strings, booleans, ISO date strings, or null. They are NOT pre-stringified — there's no need for parseFloat / parseInt on numeric columns.
- Empty results still return structuredContent.result with { status: "done", rows: [], columns, rowCount: 0 } — distinct from a parse failure.
- Lightdash applies the requested row limit to the SQL query. Ensure the SELECT statement is complete; malformed trailing SQL can surface errors near the generated LIMIT.
- On startup/validation/application/warehouse error, the response has isError: true and content[0].text contains the error message; structuredContent is omitted.
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

export type ToolRunSqlArgs = z.infer<typeof toolRunSqlArgsSchema>;
export type ToolRunSqlOutput = z.infer<typeof toolRunSqlOutputSchema>;
