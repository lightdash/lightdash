const hintKey = (organizationUuid: string) =>
    `ai-access:agent-identity:v1:${organizationUuid}`;

export const hasAgentIdentityHint = (organizationUuid: string | undefined) => {
    if (!organizationUuid) return false;
    try {
        return localStorage.getItem(hintKey(organizationUuid)) === 'true';
    } catch {
        return false;
    }
};

export const updateAgentIdentityHint = (
    organizationUuid: string | undefined,
    enabled: boolean | undefined,
) => {
    if (!organizationUuid || enabled === undefined) return;
    try {
        if (enabled) {
            localStorage.setItem(hintKey(organizationUuid), 'true');
        } else {
            localStorage.removeItem(hintKey(organizationUuid));
        }
    } catch {
        return;
    }
};
