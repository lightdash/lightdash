export const getAgentSettingsLanding = ({
    projectUuid,
    canAccessAgentDataScope,
    canAccessAiRegion,
    canManageAgentIdentity,
}: {
    projectUuid: string;
    canAccessAgentDataScope: boolean;
    canAccessAiRegion: boolean;
    canManageAgentIdentity: boolean;
}): string | null => {
    const base = `/generalSettings/projectManagement/${projectUuid}`;
    if (canAccessAgentDataScope) return `${base}/agentDataScope`;
    if (canAccessAiRegion) return `${base}/aiRegion`;
    if (canManageAgentIdentity) return `${base}/aiAccess`;
    return null;
};
