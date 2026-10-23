import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AgentCapability,
    OrganizationMemberRole,
    type AgentCapabilityPolicyOverview,
    type AgentSystemRoleMatrix,
    type ApiAiOrganizationSettingsResponse,
    type OrganizationAgentIdentityOverview,
} from '@lightdash/common';

export const agentSettingsPolicyMock = (): AgentCapabilityPolicyOverview => {
    const matrix = Object.fromEntries(
        Object.values(OrganizationMemberRole).map((role) => [
            role,
            Object.values(AgentCapability),
        ]),
    ) as AgentSystemRoleMatrix;
    return {
        mode: 'legacy',
        version: 1,
        allowedCapabilities: null,
        allowedGroupUuids: null,
        groupsAvailable: false,
        systemRoleMatrix: matrix,
        defaults: matrix,
    };
};
export const agentSettingsIdentityMock: OrganizationAgentIdentityOverview = {
    rules: [],
    snowflakeConfigured: false,
    requireVerifiedAgentSessions: false,
};
export const agentSettingsMcpMock =
    (): ApiAiOrganizationSettingsResponse['results'] => ({
        organizationUuid: 'org',
        isCopilotEnabled: true,
        aiAgentsVisible: true,
        aiAgentReviewsEnabled: false,
        aiAgentMemoryEnabled: false,
        deepResearchLimits: AI_DEEP_RESEARCH_DEFAULT_LIMITS,
        deepResearchRawSqlEnabled: false,
        mcpEnabled: true,
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: true,
        defaultAiAgentModelConfig: null,
        providerApiKeysSet: {
            anthropic: false,
            google: false,
            openai: false,
            bedrock: false,
        },
        providerApiKeyHints: {
            anthropic: null,
            google: null,
            openai: null,
            bedrock: null,
        },
        bedrockConfig: null,
        providerBaseUrls: { anthropic: null, google: null, openai: null },
        bedrockModelOptions: [],
        defaultAiAgentModelOptions: [],
    });
