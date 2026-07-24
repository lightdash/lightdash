import { type AiMcpServer } from '@lightdash/common';

export const isDeepResearchMcpServerReady = (
    mcpServer: AiMcpServer,
): boolean => {
    if (mcpServer.connectionStatus === 'error') {
        return false;
    }
    if (mcpServer.authType === 'none') {
        return true;
    }
    if (mcpServer.authType === 'bearer') {
        return mcpServer.hasCredentials;
    }
    return mcpServer.connectionStatus === 'connected';
};
