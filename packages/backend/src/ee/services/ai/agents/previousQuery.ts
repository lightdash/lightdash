import type { ModelMessage } from 'ai';
import { QUERY_TOOL_NAMES } from './queryRetryCap';

/** Only a persisted success in the immediately preceding user turn is eligible. */
export const getPreviousQueryUuid = (
    messages: ModelMessage[],
): string | undefined => {
    const results = new Map<string, string>();
    const lastUser = messages.findLastIndex(
        (message) => message.role === 'user',
    );
    for (let i = lastUser - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role === 'user') break;
        if (message.role === 'tool') {
            message.content.forEach((part) => {
                if (part.type !== 'tool-result' || part.output.type !== 'json')
                    return;
                const { value } = part.output;
                if (
                    value &&
                    typeof value === 'object' &&
                    'status' in value &&
                    value.status === 'success' &&
                    'queryUuid' in value &&
                    typeof value.queryUuid === 'string'
                ) {
                    results.set(part.toolCallId, value.queryUuid);
                }
            });
        }
        if (message.role === 'assistant' && Array.isArray(message.content)) {
            const call = message.content.findLast(
                (part) =>
                    part.type === 'tool-call' &&
                    QUERY_TOOL_NAMES.has(part.toolName),
            );
            if (call?.type === 'tool-call') {
                if (
                    !['runQuery', 'generateVisualization'].includes(
                        call.toolName,
                    )
                )
                    return undefined;
                return results.get(call.toolCallId);
            }
        }
    }
    return undefined;
};

/** Only used for the bounded presentation step. Subsequent steps retain full history. */
export const compactChartDiscovery = (
    messages: ModelMessage[],
): ModelMessage[] =>
    messages.map((message) => {
        if (message.role !== 'tool') return message;
        return {
            ...message,
            content: message.content.map((part) => {
                if (
                    part.type !== 'tool-result' ||
                    ![
                        'grepFields',
                        'getMetadata',
                        'searchSemanticLayer',
                    ].includes(part.toolName) ||
                    part.output.type !== 'json'
                )
                    return part;
                const { value } = part.output;
                if (
                    !value ||
                    typeof value !== 'object' ||
                    !('status' in value) ||
                    value.status !== 'success'
                )
                    return part;
                return {
                    ...part,
                    output: {
                        type: 'text' as const,
                        value: 'Discovery output omitted for this presentation-only step. Preserve the successful query input and scope below; its result supplies the chart fields. Full discovery remains available for subsequent analysis.',
                    },
                };
            }),
        };
    });
