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
    now: number,
    snowflakeConfigured: boolean,
    silentRefreshEnabled: boolean,
): SnowflakeAgentStatus => {
    if (!snowflakeConfigured) return 'unavailable';
    if (hasLoginError) return 'failing';
    if (!credential) return 'not_connected';
    if (credential.agentClientCurrent === false) return 'expired';
    if (
        !silentRefreshEnabled &&
        credential.expiresAt &&
        new Date(credential.expiresAt).getTime() <= now
    ) {
        return 'expired';
    }
    return 'connected';
};
