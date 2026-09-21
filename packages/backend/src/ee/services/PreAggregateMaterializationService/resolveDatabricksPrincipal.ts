import {
    assertUnreachable,
    DatabricksAuthenticationType,
    type CreateDatabricksCredentials,
} from '@lightdash/common';
import { getDatabricksOidcEndpointsFromHost } from '../../../controllers/authentication/strategies/databricksStrategy';

const getActiveToken = (
    credentials: CreateDatabricksCredentials,
): string | undefined => {
    const authenticationType =
        credentials.authenticationType ??
        DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN;
    switch (authenticationType) {
        case DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN:
            return credentials.personalAccessToken;
        case DatabricksAuthenticationType.OAUTH_M2M:
        case DatabricksAuthenticationType.OAUTH_U2M:
            return credentials.token;
        default:
            return assertUnreachable(
                authenticationType,
                'Unknown Databricks authentication',
            );
    }
};

/** Resolve the actual token principal without submitting warehouse SQL.
 * https://docs.databricks.com/api/scim/v1/workspace-user#get-current-user-info
 * Identity discovery is optional: unavailable SCIM falls back to a separately
 * proven generation-local credential scope, never a guessed principal. */
export const resolveDatabricksPrincipal = async (
    credentials: CreateDatabricksCredentials,
    fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> => {
    const token = getActiveToken(credentials);
    if (!token) return undefined;

    try {
        // Reuse the OAuth destination allowlist. Redirects must never forward
        // the bearer credential to a different destination.
        const { issuer } = getDatabricksOidcEndpointsFromHost(
            credentials.serverHostName,
        );
        const response = await fetchImpl(
            new URL('/api/2.0/preview/scim/v2/Me', issuer),
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/scim+json',
                },
                redirect: 'error',
                signal: AbortSignal.timeout(5000),
            },
        );
        if (!response.ok) return undefined;
        const principal: unknown = await response.json();
        if (
            principal === null ||
            typeof principal !== 'object' ||
            !('id' in principal) ||
            typeof principal.id !== 'string' ||
            !principal.id.trim() ||
            ('active' in principal && principal.active === false)
        ) {
            return undefined;
        }
        // Workspace scopes the identifier; userName also matters to SQL that
        // evaluates CURRENT_USER after an account rename.
        return JSON.stringify({
            provider: 'databricks',
            workspace: issuer.toLowerCase(),
            id: principal.id,
            userName:
                'userName' in principal &&
                typeof principal.userName === 'string'
                    ? principal.userName
                    : undefined,
        });
    } catch {
        // Responses and transport errors can contain secrets. Return only the
        // absence of proof; callers decide whether their fallback is usable.
        return undefined;
    }
};
