export const shouldShowSnowflakeAiSignIn = (
    flagEnabled: boolean,
    clientConfigured: boolean,
): boolean => flagEnabled && clientConfigured;
