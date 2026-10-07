export const getAgentSettingsLanding = ({
    projectUuid,
    canAccessAgentDataScope,
    canAccessAiRegion,
}: {
    projectUuid: string;
    canAccessAgentDataScope: boolean;
    canAccessAiRegion: boolean;
}): string | null => {
    const base = `/generalSettings/projectManagement/${projectUuid}`;
    if (canAccessAgentDataScope) return `${base}/agentDataScope`;
    if (canAccessAiRegion) return `${base}/aiRegion`;
    return null;
};
