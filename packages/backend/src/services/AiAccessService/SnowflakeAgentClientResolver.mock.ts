import { type ResolvedSnowflakeAgentClient } from './SnowflakeAgentClientResolver';

export const snowflakeAgentClientMock: ResolvedSnowflakeAgentClient = {
    source: 'environment',
    organizationUuid: 'org-uuid',
    clientVersion: null,
    clientId: 'ai-client',
    clientSecret: 'ai-secret',
    authorizationEndpoint: 'https://snowflake.example/authorize',
    tokenEndpoint: 'https://snowflake.example/token',
    account: 'test-account',
    accessUrl: 'https://snowflake.example',
};
