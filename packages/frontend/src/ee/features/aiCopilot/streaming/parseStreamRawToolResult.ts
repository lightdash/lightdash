import {
    agentToolDefinitionsByName,
    isAiAgentMcpToolName,
    toolDashboardV2ArgsSchemaPersisted,
    toolRunQueryArgsSchemaPersisted,
    type ToolDefinition,
    type ToolName,
} from '@lightdash/common';
import { type z } from 'zod';

type ParsedToolName = ToolName;
type McpStreamToolName = `mcp_${string}`;

// Streamed args can be wider than the advertised (formula-only) contract:
// merge-disabled runtimes advertise the wide V2 query contract and models
// resuming old threads may echo legacy template table calcs the backend still
// executes. Parse those tools with the wide persisted schemas so they render.
const wideInputSchemaOverrides = {
    generateVisualization: toolRunQueryArgsSchemaPersisted,
    generateDashboard: toolDashboardV2ArgsSchemaPersisted,
} as const;

type ToolArgs<TName extends ToolName> =
    TName extends keyof typeof wideInputSchemaOverrides
        ? z.infer<(typeof wideInputSchemaOverrides)[TName]>
        : z.infer<(typeof agentToolDefinitionsByName)[TName]['inputSchema']>;
type ToolOutputSchema<TName extends ToolName> =
    (typeof agentToolDefinitionsByName)[TName] extends ToolDefinition<
        string,
        z.ZodObject<z.ZodRawShape>,
        z.ZodTypeAny,
        infer TOutputSchema
    >
        ? TOutputSchema
        : never;
type ToolResult<TName extends ParsedToolName> = z.infer<
    NonNullable<ToolOutputSchema<TName>>
>;

export type AiAgentToolOutput = {
    [K in ParsedToolName]: ToolResult<K>;
}[ParsedToolName];

type BuiltInToolCall = {
    [K in ParsedToolName]: {
        toolName: K;
        toolArgs: ToolArgs<K>;
        toolResult?: ToolResult<K> | null;
        isPreliminary?: boolean;
    };
}[ParsedToolName];

type BuiltInToolResult = {
    [K in ParsedToolName]: {
        toolName: K;
        toolArgs: ToolArgs<K>;
        toolResult: ToolResult<K>;
        isPreliminary?: boolean;
    };
}[ParsedToolName];

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

const hasWideInputSchema = (
    toolName: ParsedToolName,
): toolName is keyof typeof wideInputSchemaOverrides =>
    toolName in wideInputSchemaOverrides;

const parseToolArgs = (toolName: ParsedToolName, toolArgs: unknown) =>
    (hasWideInputSchema(toolName)
        ? wideInputSchemaOverrides[toolName]
        : agentToolDefinitionsByName[toolName].inputSchema
    ).safeParse(toolArgs);

const parseToolOutput = (toolName: ParsedToolName, toolOutput: unknown) => {
    const outputSchema =
        agentToolDefinitionsByName[toolName].for('agent').outputSchema;

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
    if (isMcpStreamToolName(toolResult.toolName)) {
        return {
            toolName: toolResult.toolName,
            toolArgs: parseMcpToolArgs(toolResult.toolArgs),
            toolResult: toolResult.toolOutput,
            isPreliminary: toolResult.isPreliminary,
        };
    }

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
