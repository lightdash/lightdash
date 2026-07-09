import type { ModelMessage } from 'ai';

/**
 * Query-execution tools whose repeated failures we bound within a turn. Both
 * names resolve to the same underlying runQuery implementation.
 */
export const QUERY_TOOL_NAMES: ReadonlySet<string> = new Set([
    'generateVisualization',
    'runQuery',
]);

export type QueryResultClass = 'ok' | 'warehouse-slow' | 'fixable' | 'other';

// A tool result as it appears in the model messages (see defaultAgentToModelOutput):
// success → { type: 'text' }, error → { type: 'error-text' }.
type ToolResultOutput = { type: string; value: string };

const WAREHOUSE_SLOW =
    /timed out|timeout|polling|connection (terminated|lost)|econnreset/i;
const FIXABLE =
    /invalid|unknown|not found|custom metric|dimension|filter|axis|chart ?config/i;

/**
 * Classify a single query-tool result. Only `error-text` outputs count as
 * failures; a successful result is `ok` and never contributes to the cap.
 */
export const classifyQueryResult = (
    output: ToolResultOutput,
): QueryResultClass => {
    if (output.type !== 'error-text') return 'ok';
    if (WAREHOUSE_SLOW.test(output.value)) return 'warehouse-slow';
    if (FIXABLE.test(output.value)) return 'fixable';
    return 'other';
};

/**
 * Decide whether to stop the agent re-issuing query tools this turn. Trips on
 * repeated *failures* only, so legitimate multi-chart turns (several successful
 * queries) are never capped.
 *  - ≥2 warehouse-slow: re-running a heavy scan that already timed out won't help.
 *  - ≥3 errors total: the model is looping instead of converging.
 */
export const shouldCapQueryRetries = (
    classes: QueryResultClass[],
): { capped: boolean; reason: string } => {
    const warehouseSlow = classes.filter((c) => c === 'warehouse-slow').length;
    const errors = classes.filter((c) => c !== 'ok').length;
    if (warehouseSlow >= 2) {
        return {
            capped: true,
            reason: 'the warehouse query timed out repeatedly',
        };
    }
    if (errors >= 3) {
        return {
            capped: true,
            reason: 'the visualization query failed repeatedly',
        };
    }
    return { capped: false, reason: '' };
};

/**
 * Walk the model messages and classify every query-tool result, in order.
 * Non-query tool results are ignored.
 */
export const collectQueryResultClasses = (
    messages: ModelMessage[],
    queryToolNames: ReadonlySet<string>,
): QueryResultClass[] => {
    const classes: QueryResultClass[] = [];
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
                    classes.push(
                        classifyQueryResult(part.output as ToolResultOutput),
                    );
                }
            }
        }
    }
    return classes;
};

/**
 * Given the current model messages and the full tool set, decide the
 * `prepareStep` override that bounds query-tool retries: returns the reduced
 * `activeTools` (query tools removed) and a nudge message, or null when the cap
 * has not tripped. Pure so the `prepareStep` wiring stays trivial.
 */
export const buildQueryRetryStepOverride = (
    messages: ModelMessage[],
    allToolNames: string[],
): { activeTools: string[]; nudge: string } | null => {
    const decision = shouldCapQueryRetries(
        collectQueryResultClasses(messages, QUERY_TOOL_NAMES),
    );
    if (!decision.capped) return null;
    return {
        activeTools: allToolNames.filter((name) => !QUERY_TOOL_NAMES.has(name)),
        nudge: [
            `The visualization query has repeatedly failed (${decision.reason}).`,
            'Do not run it again — answer using the information you already have,',
            'or briefly explain what is blocking the result.',
        ].join(' '),
    };
};
