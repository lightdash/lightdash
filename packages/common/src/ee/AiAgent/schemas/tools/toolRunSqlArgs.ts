import { z } from 'zod';
import { structuredToolOutputSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    buildMcpVisualizationFollowUpInstruction,
    MCP_ARTIFACT_INTEGRATION_NOTE,
    MCP_QUERY_ERROR_NOTE,
    MCP_QUERY_RESULT_USAGE_NOTE,
} from './toolMcpQueryResultDescription';
import {
    executionStatsContentSchema,
    mcpSqlQueryRowsColumnsSchema,
} from './toolQueryResultSchemas';

export const DEFAULT_RUN_SQL_LIMIT = 500;
export const DEFAULT_RUN_SQL_MAX_LIMIT = 5000;

// Execution clamps every limit to the max, so the default never exceeds it.
export const getRunSqlDefaultLimit = (maxLimit: number): number =>
    Math.min(DEFAULT_RUN_SQL_LIMIT, maxLimit);

export const buildAgentRunSqlDescription = (
    defaultLimit: number,
    maxLimit: number,
) => `Execute a read-only SQL query against the project's data warehouse.

The row limit defaults to ${defaultLimit}, max ${maxLimit}.

Each result renders as its own artifact with a "Continue exploring in SQL Runner" action scoped to that query, so link to SQL Runner only through it: a link in your text cannot be scoped and points at the wrong query when a turn runs more than one.`;

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
    defaultLimit = getRunSqlDefaultLimit(maxLimit),
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
                .describe('Maximum number of rows to return.'),
        })
        .build();

export const toolRunSqlArgsSchema = createToolRunSqlArgsSchema();

export const RUN_SQL_PREVIEW_ROW_LIMIT = 50;

export const toolRunSqlStructuredContentSchema = z.object({
    rowCount: mcpSqlQueryRowsColumnsSchema.shape.rowCount,
    columns: mcpSqlQueryRowsColumnsSchema.shape.columns,
    rows: mcpSqlQueryRowsColumnsSchema.shape.rows
        .nullable()
        .describe(
            `Raw values of the preview rows rendered as CSV in the result (first ${RUN_SQL_PREVIEW_ROW_LIMIT} at most); [] when the query returned no rows. Null when data access is disabled and the rows were withheld.`,
        ),
    truncated: z
        .boolean()
        .describe(
            'True when `rows` holds only the first rows of a larger result; `rowCount` is the full count.',
        ),
    review: z.string().nullable(),
    executionStats: executionStatsContentSchema,
});

export const toolRunSqlOutputSchema = structuredToolOutputSchema({
    metadata: z.object({
        status: z.enum(['success', 'error', 'rejected', 'timeout']),
    }),
    structuredContent: toolRunSqlStructuredContentSchema,
    // Rejection and timeout are failures for this tool: they carry an error,
    // not a result set.
    errorStatuses: z.enum(['error', 'rejected', 'timeout']),
});

export type ToolRunSqlArgs = z.infer<typeof toolRunSqlArgsSchema>;
export type ToolRunSqlStructuredContent = z.infer<
    typeof toolRunSqlStructuredContentSchema
>;
export type ToolRunSqlOutput = z.infer<typeof toolRunSqlOutputSchema>;
