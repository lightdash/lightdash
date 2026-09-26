import type { Pool } from 'pg';
import { z } from 'zod';
import { single } from './assert';
import { queryRows } from './db';

// What an agent turn writes regardless of wording (plan §5 step 2).

const tokenUsageSchema = z.object({
    totalTokens: z.number(),
    finalStepTotalTokens: z.number(),
});

const promptRowSchema = z.object({
    ai_prompt_uuid: z.string(),
    created_by_user_uuid: z.string().nullable(),
    response: z.string().nullable(),
    responded_at: z.date().nullable(),
    error_message: z.string().nullable(),
    token_usage: tokenUsageSchema.loose().nullable(),
    response_timing: z.record(z.string(), z.unknown()).nullable(),
});

const toolCallRowSchema = z.object({
    tool_call_id: z.string(),
    tool_name: z.string(),
    tool_args: z.unknown(),
    ai_mcp_server_uuid: z.string().nullable(),
});

const toolResultRowSchema = z.object({
    tool_call_id: z.string(),
    tool_name: z.string(),
    result: z.string(),
    metadata: z
        .looseObject({
            status: z.string().optional(),
            queryUuid: z.string().optional(),
        })
        .nullable(),
});

const toolCallErrorRowSchema = z.object({
    tool_call_id: z.string(),
    tool_name: z.string(),
    error_message: z.string(),
});

export type PromptLedger = Awaited<ReturnType<typeof readPromptLedger>>;

export const readPromptLedger = async (db: Pool, promptUuid: string) => {
    const [prompt, toolCalls, toolResults, toolCallErrors] = await Promise.all([
        queryRows(
            db,
            `SELECT ai_prompt_uuid, created_by_user_uuid, response, responded_at, error_message, token_usage, response_timing
             FROM ai_prompt WHERE ai_prompt_uuid = $1`,
            [promptUuid],
            promptRowSchema,
        ),
        queryRows(
            db,
            `SELECT tool_call_id, tool_name, tool_args, ai_mcp_server_uuid
             FROM ai_agent_tool_call WHERE ai_prompt_uuid = $1 ORDER BY created_at`,
            [promptUuid],
            toolCallRowSchema,
        ),
        queryRows(
            db,
            `SELECT tool_call_id, tool_name, result, metadata
             FROM ai_agent_tool_result WHERE ai_prompt_uuid = $1 ORDER BY created_at`,
            [promptUuid],
            toolResultRowSchema,
        ),
        queryRows(
            db,
            `SELECT tool_call_id, tool_name, error_message
             FROM ai_agent_tool_call_error WHERE ai_prompt_uuid = $1 ORDER BY created_at`,
            [promptUuid],
            toolCallErrorRowSchema,
        ),
    ]);
    return {
        prompt: single(prompt, `ai_prompt ${promptUuid}`),
        toolCalls,
        // Results can be large; the ledger is for reading, not replaying.
        toolResults: toolResults.map((row) => ({
            ...row,
            result: row.result.slice(0, 2000),
        })),
        toolCallErrors,
    };
};

export const QUERY_TOOLS = ['generateVisualization', 'runQuery', 'runSql'];

const queryHistoryRowSchema = z.object({
    query_uuid: z.string(),
    context: z.string().nullable(),
    status: z.string(),
    total_row_count: z.number().nullable(),
    compiled_sql: z.string().nullable(),
    error: z.string().nullable(),
});

export type QueryHistoryRow = z.output<typeof queryHistoryRowSchema>;

const QUERY_HISTORY_COLUMNS =
    'query_uuid, context, status, total_row_count, compiled_sql, error';

export const readQueryHistory = async (db: Pool, queryUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT ${QUERY_HISTORY_COLUMNS} FROM query_history WHERE query_uuid = $1`,
            [queryUuid],
            queryHistoryRowSchema,
        ),
        `query_history ${queryUuid}`,
    );

/**
 * runSql records no queryUuid on its result, but the query it ran keeps the
 * tool's exact SQL in request_parameters: match on that, the prompt's user
 * and rows created after the prompt.
 */
export const readRunSqlHistory = async (
    db: Pool,
    promptUuid: string,
    sql: string,
) =>
    queryRows(
        db,
        `SELECT ${QUERY_HISTORY_COLUMNS} FROM query_history q
         JOIN ai_prompt p ON p.ai_prompt_uuid = $1
         WHERE q.request_parameters->>'sql' = $2
           AND q.created_by_user_uuid = p.created_by_user_uuid
           AND q.created_at >= p.created_at
         ORDER BY q.created_at`,
        [promptUuid, sql],
        queryHistoryRowSchema,
    );
