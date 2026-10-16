import {
    type AiMcpServer,
    type AiMcpServerAuthType,
    type AiMcpServerConnectionStatus,
} from '@lightdash/common';
import i18n from '../../../../i18n/i18n';

export const getMcpAuthTypeLabel = (authType: AiMcpServerAuthType) => {
    switch (authType) {
        case 'oauth':
            return i18n.t('mcpLabels.auth.oauth', { ns: 'aiAgent' });
        case 'bearer':
            return i18n.t('mcpLabels.auth.bearer', { ns: 'aiAgent' });
        default:
            return i18n.t('mcpLabels.auth.none', { ns: 'aiAgent' });
    }
};

export const getMcpConnectionStatusLabel = (
    mcpServer: Pick<AiMcpServer, 'authType' | 'connectionStatus'>,
) => {
    switch (mcpServer.connectionStatus) {
        case 'connected':
            return i18n.t('mcpLabels.status.connected', { ns: 'aiAgent' });
        case 'connecting':
            return i18n.t('mcpLabels.status.connecting', { ns: 'aiAgent' });
        case 'error':
            return i18n.t('mcpLabels.status.reconnectRequired', {
                ns: 'aiAgent',
            });
        case 'not_connected':
        default:
            return i18n.t('mcpLabels.status.notConnected', { ns: 'aiAgent' });
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
