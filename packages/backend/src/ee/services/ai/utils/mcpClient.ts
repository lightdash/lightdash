import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { assertUnreachable, type AiMcpServerAuthType } from '@lightdash/common';
import type { AiAgentMcpServer } from '../types/aiAgent';

type McpServerConnectionArgs = {
    name: string;
    url: string;
    authType: AiMcpServerAuthType;
    credentials: AiAgentMcpServer['credentials'];
};

const getBearerToken = (mcpServer: McpServerConnectionArgs) => {
    if (
        mcpServer.authType === 'bearer' &&
        (!mcpServer.credentials ||
            !('bearerToken' in mcpServer.credentials) ||
            !mcpServer.credentials.bearerToken)
    ) {
        throw new Error(
            `MCP server "${mcpServer.name}" is missing bearer credentials`,
        );
    }

    switch (mcpServer.authType) {
        case 'none':
            return undefined;
        case 'bearer':
            return mcpServer.credentials &&
                'bearerToken' in mcpServer.credentials
                ? mcpServer.credentials.bearerToken
                : undefined;
        case 'oauth':
            throw new Error(
                `OAuth MCP server "${mcpServer.name}" is not implemented yet`,
            );
        default:
            return assertUnreachable(
                mcpServer.authType,
                `Unknown MCP auth type: ${mcpServer.authType}`,
            );
    }
};

export const createHttpMcpClient = async (
    mcpServer: McpServerConnectionArgs,
    onUncaughtError?: (error: unknown) => void,
): Promise<MCPClient> => {
    const bearerToken = getBearerToken(mcpServer);

    return createMCPClient({
        transport: {
            type: 'http',
            url: mcpServer.url,
            headers: bearerToken
                ? {
                      Authorization: `Bearer ${bearerToken}`,
                  }
                : undefined,
            redirect: 'error',
        },
        onUncaughtError,
    });
};

export const testMcpConnection = async (
    mcpServer: McpServerConnectionArgs,
    onUncaughtError?: (error: unknown) => void,
): Promise<void> => {
    const client = await createHttpMcpClient(mcpServer, onUncaughtError);

    try {
        await client.tools();
    } finally {
        await client.close();
    }
};
