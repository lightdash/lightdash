import { z } from 'zod';
import { defineTool } from '../defineTool';
import { createToolSchema } from '../toolSchemaBuilder';

const toolRunSqlArgsSchema = createToolSchema()
    .extend({
        sql: z
            .string()
            .describe('The SQL query to execute against the data warehouse.'),
        limit: z
            .number()
            .int()
            .positive()
            .max(5000)
            .default(500)
            .describe(
                'Maximum number of rows to return. Defaults to 500, max 5000.',
            ),
    })
    .build();

const toolRunSqlOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error', 'rejected', 'timeout']),
    }),
});

// MCP `structuredContent` schema (distinct from the agent execute output).
const toolRunSqlMcpOutputSchema = z.object({
    rows: z
        .array(z.record(z.unknown()))
        .describe(
            'Result rows. Each row is an object keyed by column name. Values come from the warehouse as JSON-serializable primitives (numbers, strings, booleans, ISO date strings, or null).',
        ),
    columns: z
        .array(z.string())
        .describe(
            'Ordered list of column names matching the keys in each row of `rows`.',
        ),
    rowCount: z
        .number()
        .int()
        .nonnegative()
        .describe(
            'Total number of rows returned. May be less than the requested limit.',
        ),
});

export const runSqlTool = defineTool({
    name: 'runSql',
    title: 'Run SQL',
    description: (name) => `Tool: ${name}

Purpose:
Execute an arbitrary SQL query against the project's data warehouse and return the results. Successful results can be linked from the final answer with [Open in SQL Runner](#sql-runner-link).

Use this tool when the user wants to run a custom SQL query that doesn't fit the explore-based metric query model.
This is useful for ad-hoc analysis, data exploration, or queries that join across tables not modeled in explores.

The query is executed directly against the warehouse, so use the SQL dialect appropriate for the connected warehouse (e.g., PostgreSQL, BigQuery, Snowflake, etc.).

Parameters:
- sql: The SQL query to execute. Must be a valid SELECT statement.
- limit: Maximum number of rows to return (default 500, max 5000).

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<CSV string>" }] — header row + data rows, comma-separated. Provided for human/LLM display and as a fallback.
- structuredContent: {
    rows:     Array<Record<string, unknown>>,  // each row keyed by column name
    columns:  string[],                        // column names in order
    rowCount: number                           // total rows returned
  }

When writing code that consumes this tool (e.g. inside a live artifact), prefer structuredContent.rows over parsing the CSV. Example:

  const result = await callMcpTool('run_sql', { sql, limit });
  const rows    = result.structuredContent.rows;     // [{ status: 'completed', n: 94, total_amount: 2397 }, ...]
  const columns = result.structuredContent.columns;  // ['status', 'n', 'total_amount']

Notes:
- Values in rows are JSON-serializable primitives: numbers, strings, booleans, ISO date strings, or null. They are NOT pre-stringified — there's no need for parseFloat / parseInt on numeric columns.
- Empty results still return structuredContent with { rows: [], columns, rowCount: 0 } — distinct from a parse failure.
- On error, the response has isError: true and content[0].text contains the error message; structuredContent is omitted.
`,
    availability: 'both',
    inputSchema: toolRunSqlArgsSchema,
    agent: { outputSchema: toolRunSqlOutputSchema },
    mcp: {
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        structuredOutputSchema: toolRunSqlMcpOutputSchema,
    },
});
