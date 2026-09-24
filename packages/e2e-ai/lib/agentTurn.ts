import type { Pool } from 'pg';
import { expect } from 'playwright/test';
import { z } from 'zod';
import {
    QUERY_TOOLS,
    readPromptLedger,
    readQueryHistory,
    readRunSqlHistory,
    type PromptLedger,
    type QueryHistoryRow,
} from './ledger';
import { reportObservation } from './report';
import type { AttemptResult } from './variance';

const runSqlArgsSchema = z.looseObject({ sql: z.string() });

/** The query_history rows behind one successful query tool result. */
const queryHistoryFor = async (
    db: Pool,
    ledger: PromptLedger,
    result: PromptLedger['toolResults'][number],
): Promise<QueryHistoryRow[]> => {
    const queryUuid = result.metadata?.queryUuid;
    if (queryUuid !== undefined) return [await readQueryHistory(db, queryUuid)];
    const call = ledger.toolCalls.find(
        (candidate) => candidate.tool_call_id === result.tool_call_id,
    );
    const args = runSqlArgsSchema.safeParse(call?.tool_args);
    if (result.tool_name !== 'runSql' || !args.success) {
        throw new Error(
            `${result.tool_name} succeeded without a queryUuid: ${JSON.stringify(result.metadata)}`,
        );
    }
    return readRunSqlHistory(db, ledger.prompt.ai_prompt_uuid, args.data.sql);
};

/**
 * One answered turn, judged on its outcome: a non-empty answer, no error
 * message, and a successful query tool result backed by a ready query in the
 * warehouse. A tool error the agent recovered from (a success came after it)
 * is designed behaviour and only reported; an error after the last success
 * means the turn gave up, which is real. A turn that never called a query
 * tool comes back as variance.
 */
export const checkAnsweredTurn = async (db: Pool, promptUuid: string) => {
    const ledger = await readPromptLedger(db, promptUuid);
    const { prompt } = ledger;
    expect(prompt.response, 'ai_prompt.response').toBeTruthy();
    expect(prompt.responded_at, 'ai_prompt.responded_at').not.toBeNull();
    expect(prompt.error_message, 'ai_prompt.error_message').toBeNull();
    expect(prompt.response_timing, 'ai_prompt.response_timing').not.toBeNull();
    const tokenUsage = prompt.token_usage;
    if (tokenUsage === null) throw new Error('ai_prompt.token_usage is null');
    expect(tokenUsage.totalTokens, 'token_usage.totalTokens').toBeGreaterThan(
        0,
    );
    expect(
        tokenUsage.finalStepTotalTokens,
        'token_usage.finalStepTotalTokens',
    ).toBeGreaterThan(0);
    expect(tokenUsage.finalStepTotalTokens).toBeLessThanOrEqual(
        tokenUsage.totalTokens,
    );
    // Deliberately real even if the model retries: a schema rejection means our
    // tool contract is wrong, not the model's reading of the data (plan §5).
    expect(ledger.toolCallErrors, 'ai_agent_tool_call_error rows').toEqual([]);

    const results = ledger.toolResults;
    const isQuerySuccess = (row: (typeof results)[number]) =>
        QUERY_TOOLS.includes(row.tool_name) &&
        row.metadata?.status === 'success';
    const lastSuccessIndex = results.findLastIndex(isQuerySuccess);
    const errors = results
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.metadata?.status === 'error');
    const unrecovered = errors.filter(({ index }) => index > lastSuccessIndex);
    const recovered = errors.filter(({ index }) => index < lastSuccessIndex);
    reportObservation(
        `${recovered.length} recovered tool error(s)${recovered
            .map(({ row }) => `; ${row.tool_name}: ${row.result.slice(0, 300)}`)
            .join('')}`,
    );
    expect(
        unrecovered.map(({ row }) => `${row.tool_name}: ${row.result}`),
        'tool errors with no successful query after them',
    ).toEqual([]);

    const successes = results.filter(isQuerySuccess);
    if (successes.length === 0) {
        const attempted = ledger.toolCalls.some((call) =>
            QUERY_TOOLS.includes(call.tool_name),
        );
        if (attempted) {
            throw new Error(
                `Query tools were called but none succeeded: ${JSON.stringify(results.map((row) => row.metadata))}`,
            );
        }
    }
    for (const result of successes) {
        const history = await queryHistoryFor(db, ledger, result);
        expect(
            history.length,
            `query_history rows for ${result.tool_name}`,
        ).toBeGreaterThan(0);
        history.forEach((row) => {
            // QueryHistoryStatus.READY is the success state.
            expect(row, `query_history ${row.query_uuid}`).toMatchObject({
                context: 'ai',
                status: 'ready',
            });
            expect(row.compiled_sql, 'query_history.compiled_sql').toBeTruthy();
            expect(row.total_row_count, 'total_row_count').toBeGreaterThan(0);
        });
    }

    const verdict: AttemptResult =
        successes.length > 0
            ? { kind: 'pass' }
            : {
                  kind: 'variance',
                  assertion:
                      'no query tool was called: the model answered without a warehouse query',
                  ledger,
              };
    return { verdict, ledger, tokenUsage, successes };
};
