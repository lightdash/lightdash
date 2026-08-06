import {
    type AssistantModelMessage,
    type JSONValue,
    type ModelMessage,
} from 'ai';
import { type AiCanonicalThread } from '../../database/entities/aiAgentV3';

const providerOptions = (payload: Record<string, unknown>) =>
    payload.providerMetadata as
        | Record<string, Record<string, JSONValue>>
        | undefined;

const toolOutput = (payload: Record<string, unknown>) => {
    if (payload.state === 'output-denied') {
        return { type: 'execution-denied' as const, reason: 'Denied by user' };
    }
    const value =
        payload.state === 'output-error'
            ? { error: payload.error ?? { name: 'tool_error' } }
            : payload.output;
    return value === undefined
        ? { type: 'text' as const, value: '' }
        : { type: 'json' as const, value: value as JSONValue };
};

export const projectV3ThreadToModelMessages = (
    thread: AiCanonicalThread,
): ModelMessage[] => {
    const messages: ModelMessage[] = [];

    thread.messages.forEach((message) => {
        if (message.role === 'compaction') {
            return;
        }

        if (message.role === 'user') {
            const text = message.parts
                .filter((part) => part.type === 'text')
                .map((part) => part.payload.text)
                .filter((part): part is string => typeof part === 'string')
                .join('');
            if (text) messages.push({ role: 'user', content: text });
            return;
        }

        if (message.metadata.status === 'in_progress') return;
        let assistantContent: Exclude<
            AssistantModelMessage['content'],
            string
        > = [];
        const flushAssistant = () => {
            if (assistantContent.length === 0) return;
            messages.push({ role: 'assistant', content: assistantContent });
            assistantContent = [];
        };

        message.parts.forEach((part) => {
            switch (part.type) {
                case 'text':
                case 'reasoning': {
                    if (typeof part.payload.text !== 'string') return;
                    assistantContent.push({
                        type: part.type === 'text' ? 'text' : 'reasoning',
                        text: part.payload.text,
                        providerOptions: providerOptions(part.payload),
                    });
                    return;
                }
                case 'tool': {
                    const { toolName, state } = part.payload;
                    if (
                        !part.toolCallId ||
                        typeof toolName !== 'string' ||
                        typeof state !== 'string'
                    ) {
                        return;
                    }
                    assistantContent.push({
                        type: 'tool-call',
                        toolCallId: part.toolCallId,
                        toolName,
                        input: part.payload.input ?? {},
                        providerOptions: providerOptions(part.payload),
                        providerExecuted:
                            typeof part.payload.providerExecuted === 'boolean'
                                ? part.payload.providerExecuted
                                : undefined,
                    });
                    if (!state.startsWith('output-')) return;
                    flushAssistant();
                    messages.push({
                        role: 'tool',
                        content: [
                            {
                                type: 'tool-result',
                                toolCallId: part.toolCallId,
                                toolName,
                                output: toolOutput(part.payload),
                                providerOptions: providerOptions(part.payload),
                            },
                        ],
                    });
                    return;
                }
                default:
                    return;
            }
        });
        flushAssistant();
    });

    return messages;
};
