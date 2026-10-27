export const OAUTH_SCOPES = ['read', 'write', 'mcp:read', 'mcp:write'] as const;

export const scopesForOAuthRecord = (scopes: readonly string[]): string[] => [
    ...new Set(
        scopes.map((scope) =>
            OAUTH_SCOPES.some((known) => known === scope) ? scope : 'unknown',
        ),
    ),
];
