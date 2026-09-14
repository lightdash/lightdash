import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    buildMcpVisualizationFollowUpInstruction,
    MCP_ARTIFACT_INTEGRATION_NOTE,
    MCP_QUERY_ERROR_NOTE,
    MCP_QUERY_RESULT_USAGE_NOTE,
} from './toolMcpQueryResultDescription';

export const DEFAULT_RUN_SQL_LIMIT = 500;
export const DEFAULT_RUN_SQL_MAX_LIMIT = 5000;

export const buildAgentRunSqlDescription = (
    defaultLimit: number,
    maxLimit: number,
) => `Execute a read-only SQL query against the project's data warehouse. Prefer the semantic layer when it can answer the question; use SQL for ad-hoc analysis or queries the semantic layer cannot express.

Use a valid SELECT statement in the connected warehouse's SQL dialect.
The tool handles execution and returns a row/column summary, plus a CSV preview when data access is enabled. Empty results report zero rows. Correct validation or execution errors before retrying.

The row limit defaults to ${defaultLimit}, max ${maxLimit}.
Do not invent SQL Runner links.`;

export const buildRunSqlDescription = (
    defaultLimit: number,
    maxLimit: number,
) => `Execute a read-only SQL query against the project's data warehouse. For running queries, follow the polling instructions in the response. Prefer run_metric_query when the semantic layer can answer the question; use SQL for ad-hoc analysis or queries outside modeled explores.

Use a complete SELECT statement in the connected warehouse's SQL dialect. Lightdash applies the row limit (default ${defaultLimit}, max ${maxLimit}).
${buildMcpVisualizationFollowUpInstruction('run_sql')}

Returns SQL data, not chart artifacts. The platform provides a query-specific SQL Runner action; do not add your own SQL Runner link in the final answer.
${MCP_QUERY_RESULT_USAGE_NOTE}
${MCP_QUERY_ERROR_NOTE}

${MCP_ARTIFACT_INTEGRATION_NOTE}`;

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
            limit: z.coerce
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
