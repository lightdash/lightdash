import { type UserWarehouseCredentialsWithAgentStatus } from '@lightdash/common';

export type SnowflakeAgentStatus =
    | 'unavailable'
    | 'not_connected'
    | 'connected'
    | 'expired'
    | 'failing';

export const getSnowflakeAgentStatus = (
    credential: UserWarehouseCredentialsWithAgentStatus | null,
    hasLoginError: boolean,
    snowflakeConfigured: boolean,
): SnowflakeAgentStatus => {
    if (!snowflakeConfigured) return 'unavailable';
    if (hasLoginError) return 'failing';
    if (!credential) return 'not_connected';
    if (credential.agentClientCurrent === false) return 'expired';
    return 'connected';
};
