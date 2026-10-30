import { z } from 'zod';

export const POSTHOG_OAUTH_SCOPES = ['query:read'];

const CALLBACK_PATH = '/api/v1/ee/posthog/oauth/callback';
const CLIENT_METADATA_PATH = '/api/v1/ee/posthog/oauth/client-metadata.json';

export const getPostHogOAuthEndpoints = (origin: string) => ({
    authorizeUrl: new URL('/oauth/authorize/', origin).href,
    tokenUrl: new URL('/oauth/token/', origin).href,
});

export const getPostHogOAuthRedirectUri = (siteUrl: string) =>
    new URL(CALLBACK_PATH, siteUrl).href;

/**
 * A client metadata document for this instance. Setting POSTHOG_OAUTH_CLIENT_ID
 * to its URL lets PostHog read the client from it, with nothing to register.
 */
export const getPostHogClientMetadata = (siteUrl: string) => ({
    client_id: new URL(CLIENT_METADATA_PATH, siteUrl).href,
    client_name: 'Lightdash',
    client_uri: siteUrl,
    redirect_uris: [getPostHogOAuthRedirectUri(siteUrl)],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    'com.posthog': { scopes: POSTHOG_OAUTH_SCOPES },
});

/** The user picks exactly one PostHog project on the consent screen. */
export const buildPostHogAuthorizeUrl = ({
    origin,
    clientId,
    redirectUri,
    state,
    codeChallenge,
}: {
    origin: string;
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}): string => {
    const url = new URL(getPostHogOAuthEndpoints(origin).authorizeUrl);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: POSTHOG_OAUTH_SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        required_access_level: 'project',
    }).toString();
    return url.href;
};

const scopedTeamsSchema = z.object({
    scoped_teams: z.array(z.coerce.number().int().positive()),
});

/** The project the grant covers, or null unless it covers exactly one. */
export const getPostHogGrantedProjectId = (
    tokenResponse: Record<string, unknown>,
): string | null => {
    const parsed = scopedTeamsSchema.safeParse(tokenResponse);
    if (!parsed.success || parsed.data.scoped_teams.length !== 1) return null;
    return String(parsed.data.scoped_teams[0]);
};
