import { assertUnreachable } from '@lightdash/common';
import type { ModelMessage } from 'ai';

/**
 * Warehouse query-execution tools whose repeated failures we bound within a
 * turn. All of them run a warehouse query and surface failures as
 * `error-text` results (see defaultAgentToModelOutput), so a loop of any of
 * them can stack multi-minute scans or grow the context until it overflows.
 */
export const QUERY_TOOL_NAMES: ReadonlySet<string> = new Set([
    'generateVisualization',
    'runQuery',
    'runMetricQuery',
    'runContentQuery',
    'runSavedChart',
    'runSql',
]);

/** Re-running a heavy scan that already timed out is especially wasteful. */
export const WAREHOUSE_SLOW_CAP = 2;
/** Executed-query failures of any kind: the model is looping, not converging. */
export const WAREHOUSE_ERROR_CAP = 3;
/**
 * Schema-validation failures never reach the warehouse and usually converge
 * after the relayed error, so their bound is later and corrective, not final.
 */
export const INVALID_INPUT_CAP = 6;

type QueryResultClass = 'ok' | 'warehouse-slow' | 'invalid-input' | 'other';

// A tool result as it appears in the model messages (see toModelOutput):
// success → { type: 'text' }, error → { type: 'error-text' }.
type ToolResultOutput = { type: string; value: string };

const WAREHOUSE_SLOW =
    /timed out|timeout|polling|connection (terminated|lost)|econnreset/i;

/**
 * We deliberately do NOT bucket errors by warehouse-specific meaning
 * (permissions, scan limits, bad SQL, ...) — that would mean matching each
 * warehouse's error prose, which is brittle and only ever covers whichever
 * warehouse we hard-coded. Invalid input is likewise not detected from the
 * message text: the caller records the failed calls' ids as the AI SDK
 * reports them (`toolCall.invalid`), so classification survives SDK rewording.
 */
const classifyQueryResult = (
    output: ToolResultOutput,
    isInvalidInput: boolean,
): QueryResultClass => {
    if (output.type !== 'error-text') return 'ok';
    if (isInvalidInput) return 'invalid-input';
    if (WAREHOUSE_SLOW.test(output.value)) return 'warehouse-slow';
    return 'other';
};

const isWarehouseFailure = (c: QueryResultClass): boolean =>
    c === 'warehouse-slow' || c === 'other';

type QueryRetryCapDecision =
    | { capped: false }
    | {
          capped: true;
          reason: string;
          // give-up: remove the query tools, answer with what we have.
          // correct-input: keep the tools, steer the model to fix its input.
          kind: 'give-up' | 'correct-input';
      };

/**
 * Decide whether to stop the agent re-issuing query tools this turn. Trips on
 * repeated *failures* only, so legitimate multi-chart turns (several successful
 * queries) are never capped.
 */
const shouldCapQueryRetries = (
    classes: QueryResultClass[],
): QueryRetryCapDecision => {
    const warehouseSlow = classes.filter((c) => c === 'warehouse-slow').length;
    const warehouseErrors = classes.filter(isWarehouseFailure).length;
    const invalidInputs = classes.filter((c) => c === 'invalid-input').length;
    if (warehouseSlow >= WAREHOUSE_SLOW_CAP) {
        return {
            capped: true,
            reason: 'the warehouse query timed out repeatedly',
            kind: 'give-up',
        };
    }
    if (warehouseErrors >= WAREHOUSE_ERROR_CAP) {
        return {
            capped: true,
            reason: 'the query failed repeatedly',
            kind: 'give-up',
        };
    }
    if (invalidInputs >= INVALID_INPUT_CAP) {
        return {
            capped: true,
            reason: 'the tool input failed schema validation repeatedly',
            kind: 'correct-input',
        };
    }
    return { capped: false };
};

type QueryResult = { class: QueryResultClass; value: string };

const collectQueryResults = (
    messages: ModelMessage[],
    invalidToolCallIds: ReadonlySet<string>,
): QueryResult[] => {
    const results: QueryResult[] = [];
    for (const message of messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
            for (const part of message.content) {
                if (
                    part &&
                    typeof part === 'object' &&
                    'type' in part &&
                    part.type === 'tool-result' &&
                    'toolName' in part &&
                    QUERY_TOOL_NAMES.has(part.toolName as string) &&
                    'toolCallId' in part &&
                    'output' in part
                ) {
                    const output = part.output as ToolResultOutput;
                    results.push({
                        class: classifyQueryResult(
                            output,
                            invalidToolCallIds.has(part.toolCallId as string),
                        ),
                        value:
                            typeof output.value === 'string'
                                ? output.value
                                : '',
                    });
                }
            }
        }
    }
    return results;
};

// toolErrorHandler wraps the underlying warehouse error with a fixed prefix and
// a "Try again..." suffix; strip both so the snippet we relay to the user is
// the actual warehouse message and nothing that re-encourages retrying.
const cleanWarehouseError = (value: string): string =>
    value
        .replace(/^Error running (query|SQL query)\.?\s*/i, '')
        .replace(
            /\s*Try again if you believe the error can be resolved\.?\s*$/i,
            '',
        )
        .trim();

const MAX_ERROR_SNIPPET_CHARS = 500;

/**
 * Given the current model messages, the full tool set, and the ids of tool
 * calls the AI SDK dropped for invalid input, decide the `prepareStep`
 * override that bounds query-tool retries: returns `activeTools` and a nudge
 * message, or null when no cap has tripped. Warehouse failures remove the
 * query tools and relay the actual warehouse error so the agent surfaces it
 * (permissions / query-size limit) instead of failing silently; validation
 * loops keep the tools and steer the model to fix its input. Pure so the
 * `prepareStep` wiring stays trivial.
 */
export const buildQueryRetryStepOverride = (
    messages: ModelMessage[],
    allToolNames: string[],
    invalidToolCallIds: ReadonlySet<string>,
): { activeTools: string[]; nudge: string } | null => {
    const results = collectQueryResults(messages, invalidToolCallIds);
    const decision = shouldCapQueryRetries(results.map((r) => r.class));
    if (!decision.capped) return null;

    switch (decision.kind) {
        case 'correct-input':
            return {
                activeTools: allToolNames,
                nudge: [
                    `Your query tool calls keep failing schema validation (${decision.reason}).`,
                    'Stop retrying the same input shape.',
                    'Re-read the validation error and fix the structure of the failing part — a common mistake is wrapping each filter rule in an extra object instead of passing the flat rule the schema asks for.',
                    'If it still fails, leave the failing part out, run the simpler query, and tell the user which part you dropped so they can refine it.',
                ].join(' '),
            };
        case 'give-up': {
            const lastError = [...results]
                .reverse()
                .find((r) => isWarehouseFailure(r.class))?.value;
            const snippet = lastError
                ? cleanWarehouseError(lastError).slice(
                      0,
                      MAX_ERROR_SNIPPET_CHARS,
                  )
                : '';

            const nudge = [
                `The data query has repeatedly failed (${decision.reason}).`,
                'Do not run it again.',
                ...(snippet
                    ? [
                          `The warehouse reported: "${snippet}".`,
                          'Relay this warehouse error to the user in your reply so they can address it (for example a permissions or query-size-limit issue on their side),',
                          'then answer with whatever information you already have.',
                      ]
                    : [
                          'Answer using the information you already have,',
                          'or briefly explain what is blocking the result.',
                      ]),
            ].join(' ');

            return {
                activeTools: allToolNames.filter(
                    (name) => !QUERY_TOOL_NAMES.has(name),
                ),
                nudge,
            };
        }
        default:
            return assertUnreachable(
                decision.kind,
                'Unknown query retry cap kind',
            );
    }
};
