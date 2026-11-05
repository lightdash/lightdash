export interface AgentSettingsAccess {
    agentsPage: boolean;
    agentsMcp: boolean;
    mcpPage: 'hidden' | 'switch' | 'link';
}
export const getAgentSettingsAccess = ({
    agentIdentityEnabled,
    canManageOrganization,
    canManageOrgAiAgent,
    isAiAvailable,
}: {
    agentIdentityEnabled: boolean;
    canManageOrganization: boolean;
    canManageOrgAiAgent: boolean;
    isAiAvailable: boolean;
}): AgentSettingsAccess => {
    const agentsPage = agentIdentityEnabled && canManageOrganization;
    const canChangeMcp = isAiAvailable && canManageOrgAiAgent;
    return {
        agentsPage,
        agentsMcp: agentsPage && canChangeMcp,
        mcpPage: !canChangeMcp ? 'hidden' : agentsPage ? 'link' : 'switch',
    };
};
