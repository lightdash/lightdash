import {
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type UserWarehouseCredentialsWithAgentStatus,
} from '@lightdash/common';

export const credential: UserWarehouseCredentialsWithAgentStatus = {
    uuid: 'ai-credential',
    agentClientCurrent: true,
    expiresAt: null,
    purpose: UserWarehouseCredentialPurpose.AI,
    userUuid: 'user',
    name: 'Agent Snowflake sign-in',
    createdAt: new Date('2026-10-06T12:00:00Z'),
    updatedAt: new Date('2026-10-07T12:00:00Z'),
    credentials: {
        type: WarehouseTypes.SNOWFLAKE,
        user: 'agent-user',
        authenticationType: SnowflakeAuthenticationType.SSO,
    },
    project: null,
};
