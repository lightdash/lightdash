export const shouldShowAgentConnection = (
    flagEnabled: boolean,
    clientConfigured: boolean,
): boolean => flagEnabled && clientConfigured;
