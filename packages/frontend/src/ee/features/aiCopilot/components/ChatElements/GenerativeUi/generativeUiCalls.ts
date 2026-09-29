import { type AiAgentMessageAssistant } from '@lightdash/common';
import { type StreamPart } from '../../../store/aiAgentThreadStreamSlice';

export type GenerativeUiCall = {
    toolCallId: string;
    toolArgs: unknown;
    result: { metadata: unknown } | null;
};

/**
 * The message's generateUi calls in order: persisted calls first, then any
 * only seen live. A result from either source resolves the call.
 */
export const getGenerativeUiCalls = ({
    toolCalls,
    toolResults,
    streamParts,
}: {
    toolCalls: AiAgentMessageAssistant['toolCalls'];
    toolResults: AiAgentMessageAssistant['toolResults'];
    streamParts: StreamPart[];
}): GenerativeUiCall[] => {
    const persistedResults = new Map(
        toolResults.flatMap((result) =>
            result.toolName === 'generateUi'
                ? [[result.toolCallId, { metadata: result.metadata }] as const]
                : [],
        ),
    );
    const calls = new Map<string, GenerativeUiCall>();
    toolCalls.forEach((toolCall) => {
        if (toolCall.toolName !== 'generateUi') return;
        calls.set(toolCall.toolCallId, {
            toolCallId: toolCall.toolCallId,
            toolArgs: toolCall.toolArgs,
            result: persistedResults.get(toolCall.toolCallId) ?? null,
        });
    });
    streamParts.forEach((part) => {
        if (part.type !== 'toolCall' || part.toolName !== 'generateUi') return;
        const persisted = calls.get(part.toolCallId);
        calls.set(part.toolCallId, {
            toolCallId: part.toolCallId,
            toolArgs: persisted?.toolArgs ?? part.toolArgs,
            result:
                persisted?.result ??
                (part.toolResult
                    ? { metadata: part.toolResult.metadata }
                    : null),
        });
    });
    return [...calls.values()];
};

/** A persisted generateUi call is still waiting on the user or the agent. */
export const hasUnresolvedGenerateUi = (
    message: Pick<AiAgentMessageAssistant, 'toolCalls' | 'toolResults'>,
): boolean =>
    getGenerativeUiCalls({
        toolCalls: message.toolCalls,
        toolResults: message.toolResults,
        streamParts: [],
    }).some(({ result }) => result === null);
