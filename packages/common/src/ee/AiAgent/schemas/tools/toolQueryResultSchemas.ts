import { z } from 'zod';

const createMcpAsyncQueryUuidSchema = () => z.string().uuid();

export const mcpAsyncQueryUuidSchema = createMcpAsyncQueryUuidSchema();

export const mcpNextPollAfterMsSchema = z.number().int().positive();

export const mcpHeartbeatAtSchema = z
    .string()
    .describe(
        'ISO timestamp for when Lightdash last checked this async query and confirmed it is still running.',
    );

export const mcpRunningQueryResultSchema = z.object({
    status: z
        .literal('running')
        .describe(
            'Present when the query is still running and should be polled with get_query_result.',
        ),
    queryUuid: mcpAsyncQueryUuidSchema.describe(
        'Async query UUID to pass to get_query_result when status is running.',
    ),
    nextPollAfterMs: mcpNextPollAfterMsSchema.describe(
        'Suggested delay before polling get_query_result for this query.',
    ),
    heartbeatAt: mcpHeartbeatAtSchema,
});

export const mcpSqlQueryRowsColumnsSchema = z.object({
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

export const mcpSqlQueryCompletedResultSchema =
    mcpSqlQueryRowsColumnsSchema.extend({
        status: z.literal('done'),
        sqlRunnerUrl: z.string().nullable(),
    });

export const mcpMetricQueryResultRowsFieldsSchema = z.object({
    rows: z.array(z.record(z.unknown())),
    fields: z.record(z.unknown()),
});

export const mcpMetricQueryCompletedResultSchema =
    mcpMetricQueryResultRowsFieldsSchema.extend({
        status: z.literal('done'),
        queryUuid: createMcpAsyncQueryUuidSchema(),
        exploreUrl: z.string().nullable(),
    });

export const mcpRenderChartResultSchema = mcpMetricQueryCompletedResultSchema
    .extend({
        echartsOption: z.unknown().nullable(),
    })
    .describe('Rendered chart result for a completed query.');

export const mcpQueryResultDoneSqlResultSchema = z.object({
    status: z.literal('done'),
    queryUuid: createMcpAsyncQueryUuidSchema(),
    sqlRunnerUrl: z.string().nullable(),
    ...mcpSqlQueryRowsColumnsSchema.shape,
});

export const mcpQueryResultDoneMetricQueryResultSchema = z.object({
    status: z.literal('done'),
    queryUuid: createMcpAsyncQueryUuidSchema(),
    exploreUrl: z.string().nullable(),
    ...mcpMetricQueryResultRowsFieldsSchema.shape,
});

export const mcpQueryResultTerminalResultSchema = z.object({
    status: z.enum(['error', 'cancelled', 'expired']),
    queryUuid: createMcpAsyncQueryUuidSchema(),
    error: z.string().nullable(),
});

export const createMcpStructuredOutputSchema = <TResult extends z.ZodTypeAny>(
    result: TResult,
) =>
    z.object({
        result,
    });

export const createMcpAsyncQueryRunStructuredOutputSchema = <
    TCompletedResult extends z.ZodTypeAny,
>(
    completedResult: TCompletedResult,
) =>
    createMcpStructuredOutputSchema(
        z.union([completedResult, mcpRunningQueryResultSchema]),
    );

export const mcpRunSqlStructuredOutputSchema =
    createMcpAsyncQueryRunStructuredOutputSchema(
        mcpSqlQueryCompletedResultSchema,
    );

export const mcpRunMetricQueryStructuredOutputSchema =
    createMcpAsyncQueryRunStructuredOutputSchema(
        mcpMetricQueryCompletedResultSchema,
    );

export const mcpGetQueryResultStructuredOutputSchema =
    createMcpStructuredOutputSchema(
        z.union([
            mcpRunningQueryResultSchema,
            mcpQueryResultDoneSqlResultSchema,
            mcpQueryResultDoneMetricQueryResultSchema,
            mcpQueryResultTerminalResultSchema,
        ]),
    );

export const mcpRenderChartStructuredOutputSchema =
    createMcpStructuredOutputSchema(mcpRenderChartResultSchema);
