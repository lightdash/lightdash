export type ToolCallDisplayType =
    | 'streaming'
    | 'finished-streaming'
    | 'persisted';

export type ToolCallSummary = {
    toolCallId: string;
    toolName: string;
    toolArgs: unknown;
};
