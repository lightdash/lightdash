import { getMcpToolBaseName, type AiMcpServerTool } from '@lightdash/common';

type McpToolDefinition = Pick<
    AiMcpServerTool,
    'toolName' | 'description' | 'inputSchema'
>;

type EnabledMcpToolDefinition = McpToolDefinition & { enabled: boolean };

export const MCP_TOOL_TOKEN_WARNING_THRESHOLD = 20_000;

export const estimateMcpToolDefinitionTokens = (
    tool: McpToolDefinition,
    mcpServerName: string,
): number => {
    const serializedDefinition = JSON.stringify({
        name: getMcpToolBaseName(mcpServerName, tool.toolName),
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema,
    });

    return Math.ceil(
        new TextEncoder().encode(serializedDefinition).byteLength / 4,
    );
};

export const estimateEnabledMcpToolDefinitionTokens = (
    tools: EnabledMcpToolDefinition[],
    mcpServerName: string,
): number =>
    tools.reduce(
        (total, tool) =>
            tool.enabled
                ? total + estimateMcpToolDefinitionTokens(tool, mcpServerName)
                : total,
        0,
    );

export const formatTokenEstimate = (tokenCount: number): string => {
    if (tokenCount < 1_000) {
        return `${tokenCount}`;
    }

    return `${(tokenCount / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
};
