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

export type QueryResultClass =
    | 'ok'
    | 'warehouse-slow'
    | 'fixable'
    | 'non-retryable'
    | 'other';

// A tool result as it appears in the model messages (see toModelOutput):
// success → { type: 'text' }, error → { type: 'error-text' }.
type ToolResultOutput = { type: string; value: string };

const WAREHOUSE_SLOW =
    /timed out|timeout|polling|connection (terminated|lost)|econnreset/i;
// Errors where re-running the identical query cannot help: the warehouse
// rejected it for permissions or a hard scan/quota limit, not a transient or
// fixable reason. e.g. BigQuery `Access Denied` on a table the service account
// can't read, or `bytesBilledLimitExceeded` when the scan exceeds the
// connection's "Maximum bytes per run".
const NON_RETRYABLE =
    /access denied|permission denied|not authorized|does not have permission|bytesbilledlimitexceeded|bytes billed|maximum bytes|scan(ned)? limit|quota exceeded|exceeded quota|billing tier/i;
const FIXABLE =
    /invalid|unknown|not found|custom metric|dimension|filter|axis|chart ?config/i;

/**
 * Classify a single query-tool result. Only `error-text` outputs count as
 * failures; a successful result is `ok` and never contributes to the cap.
 * Non-retryable (permissions / scan limits) is checked before the others
 * because retrying those is always futile.
 */
export const classifyQueryResult = (
    output: ToolResultOutput,
): QueryResultClass => {
    if (output.type !== 'error-text') return 'ok';
    if (NON_RETRYABLE.test(output.value)) return 'non-retryable';
    if (WAREHOUSE_SLOW.test(output.value)) return 'warehouse-slow';
    if (FIXABLE.test(output.value)) return 'fixable';
    return 'other';
};

/**
 * Decide whether to stop the agent re-issuing query tools this turn. Trips on
 * repeated *failures* only, so legitimate multi-chart turns (several successful
 * queries) are never capped.
 *  - ≥2 non-retryable: the warehouse rejected the query (permissions / scan
 *    limit); re-running it never helps and only burns steps + context.
 *  - ≥2 warehouse-slow: re-running a heavy scan that already timed out won't help.
 *  - ≥3 errors total: the model is looping instead of converging.
 */
export const shouldCapQueryRetries = (
    classes: QueryResultClass[],
): { capped: boolean; reason: string } => {
    const nonRetryable = classes.filter((c) => c === 'non-retryable').length;
    const warehouseSlow = classes.filter((c) => c === 'warehouse-slow').length;
    const errors = classes.filter((c) => c !== 'ok').length;
    if (nonRetryable >= 2) {
        return {
            capped: true,
            reason: 'the warehouse rejected the query (permissions or a query-size limit)',
        };
    }
    if (warehouseSlow >= 2) {
        return {
            capped: true,
            reason: 'the warehouse query timed out repeatedly',
        };
    }
    if (errors >= 3) {
        return {
            capped: true,
            reason: 'the query failed repeatedly',
        };
    }
    return { capped: false, reason: '' };
};

type QueryResult = { class: QueryResultClass; value: string };

/**
 * Walk the model messages and collect every query-tool result, in order, with
 * both its class and the raw error text. Non-query tool results are ignored.
 */
export const collectQueryResults = (
    messages: ModelMessage[],
    queryToolNames: ReadonlySet<string>,
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
                    queryToolNames.has(part.toolName as string) &&
                    'output' in part
                ) {
                    const output = part.output as ToolResultOutput;
                    results.push({
                        class: classifyQueryResult(output),
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

/**
 * Walk the model messages and classify every query-tool result, in order.
 * Non-query tool results are ignored.
 */
export const collectQueryResultClasses = (
    messages: ModelMessage[],
    queryToolNames: ReadonlySet<string>,
): QueryResultClass[] =>
    collectQueryResults(messages, queryToolNames).map((r) => r.class);

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
 * Given the current model messages and the full tool set, decide the
 * `prepareStep` override that bounds query-tool retries: returns the reduced
 * `activeTools` (query tools removed) and a nudge message, or null when the cap
 * has not tripped. The nudge carries the actual warehouse error so the agent
 * relays it to the user (permissions / query-size limit) instead of failing
 * silently. Pure so the `prepareStep` wiring stays trivial.
 */
export const buildQueryRetryStepOverride = (
    messages: ModelMessage[],
    allToolNames: string[],
): { activeTools: string[]; nudge: string } | null => {
    const results = collectQueryResults(messages, QUERY_TOOL_NAMES);
    const decision = shouldCapQueryRetries(results.map((r) => r.class));
    if (!decision.capped) return null;

    const lastError = [...results]
        .reverse()
        .find((r) => r.class !== 'ok')?.value;
    const snippet = lastError
        ? cleanWarehouseError(lastError).slice(0, MAX_ERROR_SNIPPET_CHARS)
        : '';

    const nudge = [
        `The data query has repeatedly failed (${decision.reason}).`,
        'Do not run it again.',
        ...(snippet
            ? [
                  `The warehouse reported: "${snippet}".`,
                  'Report this error to the user so they can fix it (for example, table permissions or the connection’s "Maximum bytes per run" limit),',
                  'then answer with whatever information you already have.',
              ]
            : [
                  'Answer using the information you already have,',
                  'or briefly explain what is blocking the result.',
              ]),
    ].join(' ');

    return {
        activeTools: allToolNames.filter((name) => !QUERY_TOOL_NAMES.has(name)),
        nudge,
    };
};
