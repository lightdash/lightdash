import {
    friendlyName,
    type AiAgentToolCallMcpServer,
    type AiMcpServer,
} from '@lightdash/common';

export type McpProviderKind = 'generic';

export type McpProviderMetadata = {
    kind: McpProviderKind;
    label: string;
    shortLabel: string;
    fallbackIconUrl?: string;
};

export type McpToolDisplayMetadata = McpProviderMetadata & {
    iconUrl: string | null;
};

export type McpDisplayServer =
    | AiMcpServer
    | AiAgentToolCallMcpServer
    | undefined;

export const getMcpToolParts = (toolName: string) => {
    if (!toolName.startsWith('mcp_')) {
        return null;
    }

    const withoutPrefix = toolName.replace(/^mcp_/, '');
    const [serverKey, toolKey] = withoutPrefix.split('__');

    return {
        serverKey: serverKey || 'tool',
        toolKey: toolKey || null,
    };
};

const splitMcpKey = (key: string) => key.split('_').filter(Boolean);

export const sanitizeMcpToolKeyPart = (value: string) => {
    const sanitized = value
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+/, '')
        .replace(/_+$/, '');
    return sanitized.length > 0 ? sanitized.toLowerCase() : 'tool';
};

const getShortLabel = (label: string) =>
    label
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2) || 'M';

export const getMcpProviderMetadata = (
    toolName: string,
): McpProviderMetadata => {
    const parts = getMcpToolParts(toolName);
    if (!parts) {
        return {
            kind: 'generic',
            label: 'MCP',
            shortLabel: 'M',
        };
    }

    const fallbackLabel = friendlyName(parts.serverKey);
    const label = fallbackLabel || 'MCP';

    return {
        kind: 'generic',
        label,
        shortLabel: getShortLabel(label),
    };
};

export const getMcpServerDisplayName = (toolName: string) =>
    getMcpProviderMetadata(toolName).label;

export const getMcpToolDisplayName = (toolName: string) => {
    const parts = getMcpToolParts(toolName);
    if (!parts?.toolKey) {
        return toolName;
    }

    const serverTokens = splitMcpKey(parts.serverKey).filter(
        (token) => token !== 'mcp',
    );
    const toolTokens = splitMcpKey(parts.toolKey);
    const hasRepeatedServerPrefix =
        serverTokens.length > 0 &&
        serverTokens.every((token, index) => toolTokens[index] === token);
    const displayTokens = hasRepeatedServerPrefix
        ? toolTokens.slice(serverTokens.length)
        : toolTokens;
    const displayKey = displayTokens.length
        ? displayTokens.join('_')
        : parts.toolKey;

    return friendlyName(displayKey) || parts.toolKey;
};

export const getMcpServerForToolName = (
    toolName: string,
    mcpServers: AiMcpServer[] | undefined,
) => {
    const parts = getMcpToolParts(toolName);
    if (!parts || !mcpServers?.length) {
        return undefined;
    }

    return mcpServers.find(
        (server) => sanitizeMcpToolKeyPart(server.name) === parts.serverKey,
    );
};

const getConfiguredIconUrl = (mcpServer: McpDisplayServer) => {
    if (!mcpServer) {
        return null;
    }

    return mcpServer.iconUrl ?? null;
};

export const getMcpToolDisplayMetadata = (
    toolName: string,
    mcpServer: McpDisplayServer,
): McpToolDisplayMetadata => {
    const provider = getMcpProviderMetadata(toolName);
    return {
        ...provider,
        label: mcpServer?.name ?? provider.label,
        iconUrl:
            getConfiguredIconUrl(mcpServer) ?? provider.fallbackIconUrl ?? null,
    };
};
