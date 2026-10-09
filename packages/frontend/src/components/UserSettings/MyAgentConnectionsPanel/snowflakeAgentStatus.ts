import { type UserWarehouseCredentials } from '@lightdash/common';

export type SnowflakeAgentStatus =
    | 'not_connected'
    | 'connected'
    | 'expired'
    | 'failing';

export const getSnowflakeAgentStatus = (
    credential: UserWarehouseCredentials | null,
    hasLoginError: boolean,
    now: number,
): SnowflakeAgentStatus => {
    if (hasLoginError) return 'failing';
    if (!credential) return 'not_connected';
    if (
        credential.expiresAt &&
        new Date(credential.expiresAt).getTime() <= now
    ) {
        return 'expired';
    }
    return 'connected';
};
