import type { ModelMessage } from 'ai';

type ResumedToolCall = {
    toolCallId: string;
    toolName: string;
    input: unknown;
};

/**
 * The tool calls a run resumes from history: approval responses in the
 * trailing tool message whose call has no result yet. Mirrors the AI SDK's
 * (unexported) collectToolApprovals, so the resumed run streams output for
 * exactly these calls.
 */
export const getResumedToolCalls = (
    messages: ModelMessage[],
): ResumedToolCall[] => {
    const last = messages.at(-1);
    if (last?.role !== 'tool') return [];

    const assistantParts = messages.flatMap((message) =>
        message.role === 'assistant' && typeof message.content !== 'string'
            ? message.content
            : [],
    );
    const toolCallById = new Map(
        assistantParts.flatMap((part) =>
            part.type === 'tool-call' ? [[part.toolCallId, part] as const] : [],
        ),
    );
    const callIdByApprovalId = new Map(
        assistantParts.flatMap((part) =>
            part.type === 'tool-approval-request'
                ? [[part.approvalId, part.toolCallId] as const]
                : [],
        ),
    );
    const resultByCallId = new Map(
        last.content.flatMap((part) =>
            part.type === 'tool-result'
                ? [[part.toolCallId, part] as const]
                : [],
        ),
    );

    return last.content.flatMap((part) => {
        if (part.type !== 'tool-approval-response') return [];
        const toolCallId = callIdByApprovalId.get(part.approvalId);
        const toolCall =
            toolCallId === undefined ? undefined : toolCallById.get(toolCallId);
        if (toolCall === undefined) return [];
        const result = resultByCallId.get(toolCall.toolCallId);
        if (
            result !== undefined &&
            (part.approved || result.output.type !== 'execution-denied')
        ) {
            return [];
        }
        return [
            {
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
            },
        ];
    });
};
