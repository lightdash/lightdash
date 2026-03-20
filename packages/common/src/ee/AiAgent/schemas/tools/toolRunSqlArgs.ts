import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';

const TOOL_RUN_SQL_DESCRIPTION = `Tool: run_sql

Purpose:
Execute an arbitrary SQL query against the project's data warehouse and return the results.

Use this tool when the user wants to run a custom SQL query that doesn't fit the explore-based metric query model.
This is useful for ad-hoc analysis, data exploration, or queries that join across tables not modeled in explores.

The query is executed directly against the warehouse, so use the SQL dialect appropriate for the connected warehouse (e.g., PostgreSQL, BigQuery, Snowflake, etc.).

Parameters:
- sql: The SQL query to execute. Must be a valid SELECT statement.
- limit: Maximum number of rows to return (default 500, max 5000).
`;

export const toolRunSqlArgsSchema = createToolSchema({
    description: TOOL_RUN_SQL_DESCRIPTION,
})
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

export type ToolRunSqlArgs = z.infer<typeof toolRunSqlArgsSchema>;
