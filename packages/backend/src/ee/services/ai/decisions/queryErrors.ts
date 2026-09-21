import type { ModelMessage } from 'ai';
import {
    isKnownQueryRetryError,
    QUERY_TOOL_NAMES,
} from '../agents/queryRetryCap';
import type { AiDecisionClient } from './AiDecisionClient';
import { classifyUnknownError } from './errorClassification';

export const queryErrorOverride = async ({
    decisions,
    messages,
    checked,
    allToolNames,
    invalidToolCallIds = new Set<string>(),
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    messages: ModelMessage[];
    checked: Map<string, string | null>;
    allToolNames: string[];
    invalidToolCallIds?: ReadonlySet<string>;
}): Promise<{
    activeTools: string[];
    nudge: string;
    markerKey: string;
} | null> => {
    const stopped = [...checked.entries()].find(
        ([, category]) => category !== null,
    );
    const stop = (toolCallId: string, category: string) => ({
        activeTools: allToolNames.filter((name) => !QUERY_TOOL_NAMES.has(name)),
        nudge: `A query failed because of ${category === 'permissions' ? 'access or credentials' : 'warehouse connectivity'}. Query edits will not resolve this failure. Explain the concrete error briefly, retain any successful evidence already gathered, and do not retry the query in this turn.`,
        markerKey: `decision-${toolCallId}`,
    });
    // A subsequent non-query tool must not accidentally re-enable queries.
    if (stopped?.[1]) return stop(stopped[0], stopped[1]);
    const message = messages.findLast((m) => m.role === 'tool');
    if (!message || message.role !== 'tool') return null;
    const result = message.content.findLast(
        (part) =>
            part.type === 'tool-result' && QUERY_TOOL_NAMES.has(part.toolName),
    );
    if (
        !result ||
        result.type !== 'tool-result' ||
        result.output.type !== 'error-text'
    )
        return null;
    if (
        invalidToolCallIds.has(result.toolCallId) ||
        isKnownQueryRetryError(result.output.value)
    )
        return null;
    if (!checked.has(result.toolCallId)) {
        checked.set(
            result.toolCallId,
            await classifyUnknownError({
                decisions,
                error: result.output.value,
                domain: 'query',
            }),
        );
    }
    const category = checked.get(result.toolCallId);
    if (!category) return null;
    return stop(result.toolCallId, category);
};
