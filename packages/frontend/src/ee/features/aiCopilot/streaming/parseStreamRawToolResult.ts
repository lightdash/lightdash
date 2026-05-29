import { agentToolDefinitionsByName, type ToolName } from '@lightdash/common';
import { type z } from 'zod';

type ParsedToolName = ToolName;
type ToolArgs<TName extends ParsedToolName> = z.infer<
    (typeof agentToolDefinitionsByName)[TName]['inputSchema']
>;
type ToolResult<TName extends ParsedToolName> = z.infer<
    NonNullable<
        ReturnType<
            (typeof agentToolDefinitionsByName)[TName]['for']
        >['outputSchema']
    >
>;

export type AiAgentToolCall = {
    [K in ParsedToolName]: {
        toolName: K;
        toolArgs: ToolArgs<K>;
        isPreliminary?: boolean;
    };
}[ParsedToolName];

export type AiAgentToolResult = {
    [K in ParsedToolName]: {
        toolName: K;
        toolArgs: ToolArgs<K>;
        toolResult: ToolResult<K>;
        isPreliminary?: boolean;
    };
}[ParsedToolName];

export type AiAgentToolCallHandler = (toolCall: AiAgentToolCall) => void;
export type AiAgentToolResultHandler = (toolResult: AiAgentToolResult) => void;

export type StreamRawToolCall = {
    toolName: string;
    toolArgs: unknown;
    isPreliminary?: boolean;
};

export type StreamRawToolResult = StreamRawToolCall & {
    toolOutput: unknown;
};

const isParsedToolName = (toolName: string): toolName is ParsedToolName =>
    toolName in agentToolDefinitionsByName;

const parseToolArgs = (toolName: ParsedToolName, toolArgs: unknown) =>
    agentToolDefinitionsByName[toolName].inputSchema.safeParse(toolArgs);

const parseToolOutput = (toolName: ParsedToolName, toolOutput: unknown) => {
    const outputSchema =
        agentToolDefinitionsByName[toolName].for('agent').outputSchema;

    return outputSchema?.safeParse(toolOutput) ?? null;
};

export const parseStreamRawToolCall = (
    toolCall: StreamRawToolCall,
): AiAgentToolCall | null => {
    if (!isParsedToolName(toolCall.toolName)) return null;

    const toolArgs = parseToolArgs(toolCall.toolName, toolCall.toolArgs);
    if (!toolArgs.success) return null;

    return {
        toolName: toolCall.toolName,
        toolArgs: toolArgs.data,
        isPreliminary: toolCall.isPreliminary,
    } as AiAgentToolCall;
};

export const parseStreamRawToolResult = (
    toolResult: StreamRawToolResult,
): AiAgentToolResult | null => {
    if (!isParsedToolName(toolResult.toolName)) return null;

    const toolArgs = parseToolArgs(toolResult.toolName, toolResult.toolArgs);
    const parsedToolResult = parseToolOutput(
        toolResult.toolName,
        toolResult.toolOutput,
    );
    if (!toolArgs.success || !parsedToolResult?.success) return null;

    return {
        toolName: toolResult.toolName,
        toolArgs: toolArgs.data,
        toolResult: parsedToolResult.data,
        isPreliminary: toolResult.isPreliminary,
    } as AiAgentToolResult;
};
