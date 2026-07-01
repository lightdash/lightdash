import {
    agentToolDefinitionsByName,
    discoverFieldsToolDefinition,
    isAiAgentMcpToolName,
    type ToolDefinition,
} from '@lightdash/common';
import { type z } from 'zod';

const toolDefinitionsByName = {
    ...agentToolDefinitionsByName,
    discoverFields: discoverFieldsToolDefinition,
};
type McpStreamToolName = `mcp_${string}`;

type ToolArgs<TName extends keyof typeof toolDefinitionsByName> = z.infer<
    (typeof toolDefinitionsByName)[TName]['inputSchema']
>;
type ToolOutputSchema<TName extends keyof typeof toolDefinitionsByName> =
    (typeof toolDefinitionsByName)[TName] extends ToolDefinition<
        string,
        z.ZodObject<z.ZodRawShape>,
        z.ZodTypeAny,
        infer TOutputSchema
    >
        ? TOutputSchema
        : never;
type ToolResult<TName extends keyof typeof toolDefinitionsByName> = z.infer<
    NonNullable<ToolOutputSchema<TName>>
>;

export type AiAgentToolOutput = {
    [K in keyof typeof toolDefinitionsByName]: ToolResult<K>;
}[keyof typeof toolDefinitionsByName];

type BuiltInToolCall = {
    [K in keyof typeof toolDefinitionsByName]: {
        toolName: K;
        toolArgs: ToolArgs<K>;
        toolResult?: ToolResult<K> | null;
        isPreliminary?: boolean;
    };
}[keyof typeof toolDefinitionsByName];

type BuiltInToolResult = {
    [K in keyof typeof toolDefinitionsByName]: {
        toolName: K;
        toolArgs: ToolArgs<K>;
        toolResult: ToolResult<K>;
        isPreliminary?: boolean;
    };
}[keyof typeof toolDefinitionsByName];

type McpToolCall = {
    toolName: McpStreamToolName;
    toolArgs: object;
    toolResult?: unknown;
    isPreliminary?: boolean;
};

type McpToolResult = {
    toolName: McpStreamToolName;
    toolArgs: object;
    toolResult: unknown;
    isPreliminary?: boolean;
};

export type AiAgentToolCall = BuiltInToolCall | McpToolCall;
export type AiAgentToolResult = BuiltInToolResult | McpToolResult;
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

const isBuiltInToolName = (
    toolName: string,
): toolName is keyof typeof toolDefinitionsByName =>
    toolName in toolDefinitionsByName;

const isMcpStreamToolName = (toolName: string): toolName is McpStreamToolName =>
    isAiAgentMcpToolName(toolName);

const parseMcpToolArgs = (toolArgs: unknown): object =>
    toolArgs && typeof toolArgs === 'object' && !Array.isArray(toolArgs)
        ? toolArgs
        : {};

const parseToolArgs = (
    toolName: keyof typeof toolDefinitionsByName,
    toolArgs: unknown,
) => toolDefinitionsByName[toolName].inputSchema.safeParse(toolArgs);

const parseToolOutput = (
    toolName: keyof typeof toolDefinitionsByName,
    toolOutput: unknown,
) => {
    const outputSchema =
        toolDefinitionsByName[toolName].for('agent').outputSchema;

    return outputSchema?.safeParse(toolOutput) ?? null;
};

export const parseStreamRawToolCall = (
    toolCall: StreamRawToolCall,
): AiAgentToolCall | null => {
    if (isMcpStreamToolName(toolCall.toolName)) {
        return {
            toolName: toolCall.toolName,
            toolArgs: parseMcpToolArgs(toolCall.toolArgs),
            isPreliminary: toolCall.isPreliminary,
        };
    }

    if (!isBuiltInToolName(toolCall.toolName)) return null;
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
    if (isMcpStreamToolName(toolResult.toolName)) {
        return {
            toolName: toolResult.toolName,
            toolArgs: parseMcpToolArgs(toolResult.toolArgs),
            toolResult: toolResult.toolOutput,
            isPreliminary: toolResult.isPreliminary,
        };
    }

    if (!isBuiltInToolName(toolResult.toolName)) return null;
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
