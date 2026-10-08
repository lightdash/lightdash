export const shouldShowAgentConnection = (
    flagEnabled: boolean,
    clientConfigured: boolean,
    hasBigQueryServiceAccountRule = false,
): boolean =>
    flagEnabled && (clientConfigured || hasBigQueryServiceAccountRule);
