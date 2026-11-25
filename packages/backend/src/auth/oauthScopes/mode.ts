import Logger from '../../logging/logger';

export type OAuthScopeMode = 'log' | 'enforce';

export const OAUTH_SCOPES = ['read', 'write', 'mcp:read', 'mcp:write'] as const;

export const scopesForOAuthRecord = (scopes: readonly string[]): string[] => [
    ...new Set(
        scopes.map((scope) =>
            OAUTH_SCOPES.some((known) => known === scope) ? scope : 'unknown',
        ),
    ),
];

export const clientIdForOAuthRecord = (
    clientId: string | null | undefined,
): string | null => {
    if (clientId == null) return null;
    try {
        const url = new URL(clientId);
        return `${url.origin}${url.pathname}`;
    } catch {
        return clientId.slice(0, 128);
    }
};

export type OAuthRecordUser = {
    userUuid: string | null;
    organizationUuid: string | null;
};

export const logOAuthScopeDefaulted = ({
    clientId,
    resolvedScopes,
    user,
    grant,
}: {
    clientId: string;
    resolvedScopes: readonly string[];
    user: OAuthRecordUser;
    grant: 'authorize' | 'refresh';
}): void => {
    Logger.info('oauth_scope_defaulted', {
        clientId: clientIdForOAuthRecord(clientId),
        resolvedScopes: scopesForOAuthRecord(resolvedScopes),
        userUuid: user.userUuid,
        organizationUuid: user.organizationUuid,
        grant,
    });
};
