import { validate as isUuid } from 'uuid';
import { createAgentConnectionFetch } from './apiUrl';
import { responseRecord } from './statusResponse';

export const unboundConnection =
    'The server returned a token that is not bound to this agent connection. No credential was saved.';
export class ConnectionProofError extends Error {
    constructor(message = unboundConnection) {
        super(message);
    }
}
export const exchangeInitialConnectionToken = async ({
    instanceUrl,
    code,
    verifier,
    redirectUri,
    grantUuid,
    signal,
    proxyAuthorization,
}: {
    instanceUrl: string;
    code: string;
    verifier: string;
    redirectUri: string;
    grantUuid: string | null;
    signal: AbortSignal;
    proxyAuthorization: string | null;
}) => {
    const fetch = createAgentConnectionFetch(instanceUrl);
    const response = await fetch('/api/v1/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(proxyAuthorization === null
                ? {}
                : { 'Proxy-Authorization': proxyAuthorization }),
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
            client_id: 'lightdash-cli',
            resource: instanceUrl,
        }),
        redirect: 'error',
        signal,
    });
    if (!response.ok) throw new ConnectionProofError();
    const value: unknown = await response.json();
    const token = responseRecord(value);
    const metadata =
        token.agent_connection === undefined
            ? null
            : responseRecord(token.agent_connection);
    const hint = metadata?.grant_uuid ?? grantUuid;
    if (hint === null || hint === undefined)
        throw new ConnectionProofError(
            'The server did not identify an agent connection. No credential was saved.',
        );
    const revision = metadata?.grant_revision ?? null;
    const lifetime = token.expires_in;
    const refreshLifetime = token.refresh_expires_in ?? null;
    if (
        typeof hint !== 'string' ||
        !isUuid(hint) ||
        (grantUuid !== null && (!isUuid(grantUuid) || grantUuid !== hint)) ||
        (metadata !== null && metadata.grant_uuid !== hint) ||
        (revision !== null &&
            (typeof revision !== 'number' ||
                !Number.isSafeInteger(revision) ||
                revision < 1)) ||
        typeof token.access_token !== 'string' ||
        !token.access_token ||
        typeof token.refresh_token !== 'string' ||
        !token.refresh_token ||
        typeof token.token_type !== 'string' ||
        token.token_type.toLowerCase() !== 'bearer' ||
        typeof lifetime !== 'number' ||
        !Number.isSafeInteger(lifetime) ||
        lifetime < 1 ||
        lifetime > 2147483647 ||
        (refreshLifetime !== null &&
            (typeof refreshLifetime !== 'number' ||
                !Number.isSafeInteger(refreshLifetime) ||
                refreshLifetime < 1 ||
                refreshLifetime > 2147483647)) ||
        typeof token.scope !== 'string' ||
        !/^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*$/.test(
            token.scope,
        ) ||
        (token.resource !== undefined && token.resource !== instanceUrl) ||
        (token.issuer !== undefined && token.issuer !== instanceUrl)
    )
        throw new ConnectionProofError();
    const now = Date.now();
    return {
        grantUuid: hint,
        grantRevision: revision,
        tokens: {
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            accessTokenExpiresAt: new Date(now + lifetime * 1000).toISOString(),
            refreshTokenExpiresAt:
                refreshLifetime === null
                    ? null
                    : new Date(now + refreshLifetime * 1000).toISOString(),
            scopes: [...new Set(token.scope.split(' '))],
            generation: 1,
            lastRefreshAttemptUuid: null,
        },
    };
};
