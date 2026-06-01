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
) => `Execute an arbitrary SQL query against the project's data warehouse and return the results. Successful results can be linked from the final answer with [Open in SQL Runner](#sql-runner-link).

Use this tool when the user wants to run a custom SQL query that doesn't fit the explore-based metric query model.
This is useful for ad-hoc analysis, data exploration, or queries that join across tables not modeled in explores.

The query is executed directly against the warehouse, so use the SQL dialect appropriate for the connected warehouse (e.g., PostgreSQL, BigQuery, Snowflake, etc.).

Parameters:
- sql: The SQL query to execute. Must be a valid SELECT statement.
- limit: Maximum number of rows to return (default ${defaultLimit}, max ${maxLimit}).

${buildMcpQueryRunResponseDescription({
    contentDescription:
        'CSV with a header row plus data rows. Empty results return prose text like "Query returned 0 rows."',
    completedResultShape: `    result: {
      status: "done",
      rows:     Array<Record<string, unknown>>,  // each row keyed by column name
      columns:  string[],                        // column names in order
      rowCount: number,                          // total rows returned
      sqlRunnerUrl: string | null                // shareable URL to inspect/edit the SQL in SQL Runner
    }`,
})}

Notes:
${MCP_QUERY_COMMON_NOTES}
- Values in rows are JSON-serializable primitives: numbers, strings, booleans, ISO date strings, or null. They are NOT pre-stringified — there's no need for parseFloat / parseInt on numeric columns.
- Empty results still return structuredContent.result with { status: "done", rows: [], columns, rowCount: 0, sqlRunnerUrl } — distinct from a parse failure.
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
