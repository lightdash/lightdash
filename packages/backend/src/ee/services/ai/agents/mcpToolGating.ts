import type { ModelMessage } from 'ai';

const getToolCalls = (messages: ModelMessage[]) =>
    messages.flatMap((message) =>
        message.role === 'assistant' && Array.isArray(message.content)
            ? message.content.filter((part) => part.type === 'tool-call')
            : [],
    );

export const getMcpActiveTools = (
    messages: ModelMessage[],
    allToolNames: string[],
    mcpToolNames: string[],
): string[] | undefined => {
    if (mcpToolNames.length === 0) return undefined;

    const currentMcpToolNames = new Set(mcpToolNames);
    const loadedMcpToolNames = new Set<string>();

    for (const toolCall of getToolCalls(messages)) {
        if (currentMcpToolNames.has(toolCall.toolName)) {
            loadedMcpToolNames.add(toolCall.toolName);
        }
        if (
            toolCall.toolName === 'loadMcpTools' &&
            toolCall.input &&
            typeof toolCall.input === 'object' &&
            'names' in toolCall.input &&
            Array.isArray(toolCall.input.names)
        ) {
            for (const name of toolCall.input.names) {
                if (typeof name === 'string' && currentMcpToolNames.has(name)) {
                    loadedMcpToolNames.add(name);
                }
            }
        }
    }

    return [
        ...allToolNames.filter((name) => !currentMcpToolNames.has(name)),
        ...[...loadedMcpToolNames].sort(),
    ];
};
