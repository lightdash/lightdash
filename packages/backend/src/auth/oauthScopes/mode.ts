import Logger from '../../logging/logger';

export type OAuthScopeMode = 'log' | 'enforce';

export const OAUTH_SCOPES = ['read', 'write', 'mcp:read', 'mcp:write'] as const;

export const isKnownOAuthScope = (scope: string): boolean =>
    OAUTH_SCOPES.some((known) => known === scope);

export const splitOAuthScopes = (
    scopes: readonly string[],
): { known: string[]; ignored: string[] } => ({
    known: scopes.filter(isKnownOAuthScope),
    ignored: scopes.filter((scope) => !isKnownOAuthScope(scope)),
});

export const scopesForOAuthRecord = (scopes: readonly string[]): string[] => [
    ...new Set(
        scopes.map((scope) => (isKnownOAuthScope(scope) ? scope : 'unknown')),
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

export type OAuthScopeGrant = 'authorize' | 'refresh' | 'token_exchange';

const MAX_IGNORED_SCOPES_RECORDED = 10;
const MAX_IGNORED_SCOPE_LENGTH = 64;

export const logOAuthScopeDefaulted = ({
    clientId,
    resolvedScopes,
    user,
    grant,
}: {
    clientId: string;
    resolvedScopes: readonly string[];
    user: OAuthRecordUser;
    grant: OAuthScopeGrant;
}): void => {
    Logger.info('oauth_scope_defaulted', {
        clientId: clientIdForOAuthRecord(clientId),
        resolvedScopes: scopesForOAuthRecord(resolvedScopes),
        userUuid: user.userUuid,
        organizationUuid: user.organizationUuid,
        grant,
    });
};

export const logOAuthScopeIgnored = ({
    clientId,
    ignoredScopes,
    resolvedScopes,
    user,
    grant,
}: {
    clientId: string;
    ignoredScopes: readonly string[];
    resolvedScopes: readonly string[];
    user: OAuthRecordUser;
    grant: OAuthScopeGrant;
}): void => {
    Logger.info('oauth_scope_ignored', {
        clientId: clientIdForOAuthRecord(clientId),
        ignoredScopes: [...new Set(ignoredScopes)]
            .slice(0, MAX_IGNORED_SCOPES_RECORDED)
            .map((scope) => scope.slice(0, MAX_IGNORED_SCOPE_LENGTH)),
        resolvedScopes: scopesForOAuthRecord(resolvedScopes),
        userUuid: user.userUuid,
        organizationUuid: user.organizationUuid,
        grant,
    });
};

export const logOAuthScopeResolution = ({
    clientId,
    registeredScopes,
    requestedScopes,
    resolvedScopes,
    user,
    grant,
}: {
    clientId: string;
    registeredScopes: readonly string[];
    requestedScopes: readonly string[];
    resolvedScopes: readonly string[];
    user: OAuthRecordUser;
    grant: OAuthScopeGrant;
}): void => {
    const defaulted = requestedScopes.length === 0;
    const { ignored } = splitOAuthScopes(
        defaulted ? registeredScopes : requestedScopes,
    );
    if (defaulted)
        logOAuthScopeDefaulted({ clientId, resolvedScopes, user, grant });
    if (ignored.length > 0)
        logOAuthScopeIgnored({
            clientId,
            ignoredScopes: ignored,
            resolvedScopes,
            user,
            grant,
        });
};
