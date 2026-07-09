import {
    agentToolDefinitionsByName,
    isAiAgentMcpToolName,
    type ToolName,
    type ToolOutput,
} from '@lightdash/common';
import { type z } from 'zod';

type ParsedToolName = ToolName;
type McpStreamToolName = `mcp_${string}`;

type ToolArgs<TName extends ToolName> = TName extends ToolName
    ? z.infer<(typeof agentToolDefinitionsByName)[TName]['inputSchema']>
    : never;
type ToolResult = ToolOutput;

export type AiAgentToolOutput = ToolOutput;

type BuiltInToolArgs = ToolArgs<ParsedToolName>;

type BuiltInToolCall = {
    toolName: ParsedToolName;
    toolArgs: BuiltInToolArgs;
    toolResult?: ToolResult | null;
    isPreliminary?: boolean;
};

type BuiltInToolResult = {
    toolName: ParsedToolName;
    toolArgs: BuiltInToolArgs;
    toolResult: ToolResult;
    isPreliminary?: boolean;
};

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

const isParsedToolName = (toolName: string): toolName is ParsedToolName =>
    toolName in agentToolDefinitionsByName;

const isMcpStreamToolName = (toolName: string): toolName is McpStreamToolName =>
    isAiAgentMcpToolName(toolName);

const parseMcpToolArgs = (toolArgs: unknown): object =>
    toolArgs && typeof toolArgs === 'object' && !Array.isArray(toolArgs)
        ? toolArgs
        : {};

type ParseResult<T> = { success: true; data: T } | { success: false };

const parseToolArgs = (
    toolName: ParsedToolName,
    toolArgs: unknown,
): ParseResult<BuiltInToolArgs> => {
    const result =
        agentToolDefinitionsByName[toolName].inputSchema.safeParse(toolArgs);

    if (!result.success) {
        return { success: false };
    }

    return { success: true, data: result.data };
};

const parseToolOutput = (
    toolName: ParsedToolName,
    toolOutput: unknown,
): ParseResult<ToolOutput> => {
    const result =
        agentToolDefinitionsByName[toolName].outputSchema.safeParse(toolOutput);

    if (!result.success) {
        return { success: false };
    }

    return { success: true, data: result.data };
};

const parseBuiltInToolCall = (
    toolName: ParsedToolName,
    toolArgs: unknown,
    isPreliminary?: boolean,
): BuiltInToolCall | null => {
    const parsedToolArgs = parseToolArgs(toolName, toolArgs);
    if (!parsedToolArgs.success) return null;

    return {
        toolName,
        toolArgs: parsedToolArgs.data,
        isPreliminary,
    };
};

const parseBuiltInToolResult = (
    toolName: ParsedToolName,
    toolArgs: unknown,
    toolOutput: unknown,
    isPreliminary?: boolean,
): BuiltInToolResult | null => {
    const parsedToolArgs = parseToolArgs(toolName, toolArgs);
    const parsedToolResult = parseToolOutput(toolName, toolOutput);
    if (!parsedToolArgs.success || !parsedToolResult.success) return null;

    return {
        toolName,
        toolArgs: parsedToolArgs.data,
        toolResult: parsedToolResult.data,
        isPreliminary,
    };
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

    if (!isParsedToolName(toolCall.toolName)) return null;

    return parseBuiltInToolCall(
        toolCall.toolName,
        toolCall.toolArgs,
        toolCall.isPreliminary,
    );
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

    if (!isParsedToolName(toolResult.toolName)) return null;

    return parseBuiltInToolResult(
        toolResult.toolName,
        toolResult.toolArgs,
        toolResult.toolOutput,
        toolResult.isPreliminary,
    );
};
