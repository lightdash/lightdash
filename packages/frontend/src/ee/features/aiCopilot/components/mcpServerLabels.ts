import {
    type AiMcpServer,
    type AiMcpServerAuthType,
    type AiMcpServerConnectionStatus,
} from '@lightdash/common';

export const getMcpAuthTypeLabel = (authType: AiMcpServerAuthType) => {
    switch (authType) {
        case 'oauth':
            return 'OAuth';
        case 'bearer':
            return 'Bearer';
        default:
            return 'No auth';
    }
};

export const getMcpConnectionStatusLabel = (
    mcpServer: Pick<AiMcpServer, 'authType' | 'connectionStatus'>,
) => {
    switch (mcpServer.connectionStatus) {
        case 'connected':
            return 'Connected';
        case 'connecting':
            return 'Connecting';
        case 'error':
            return 'Reconnect required';
        case 'not_connected':
        default:
            return 'Not connected';
    }
};

export const getMcpConnectionStatusColor = (
    connectionStatus: AiMcpServerConnectionStatus | null,
) => {
    switch (connectionStatus) {
        case 'connected':
            return 'green';
        case 'connecting':
            return 'blue';
        case 'error':
            return 'red';
        case 'not_connected':
        default:
            return 'gray';
    }
};

export const getMcpServerIconColor = getMcpConnectionStatusColor;
