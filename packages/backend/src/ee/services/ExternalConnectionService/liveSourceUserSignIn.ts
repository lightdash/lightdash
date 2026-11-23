/**
 * Each viewer's own sign-in to a live source that queries as each viewer:
 * where the browser goes, and where it comes back to.
 */

const CALLBACK_PATH = '/api/v1/ee/live-sources/user-sign-in/callback';
const HYDRA_AUTHORIZE_PATH = '/api/v1/ee/live-sources/hydra/oauth/authorize';

/** A viewer's sign-in waiting in their session for the integration to answer. */
export type LiveSourceUserSignInSession = {
    projectUuid: string;
    connectionUuid: string;
    redirectUri: string;
    codeVerifier: string;
    /** The app path to return to, such as the chart that asked. */
    returnPath: string;
};

export const getLiveSourceUserSignInRedirectUri = (siteUrl: string) =>
    new URL(CALLBACK_PATH, siteUrl).href;

/**
 * Where to send the viewer back: a path in this app only, so the sign-in
 * can't be used to redirect anywhere else.
 */
export const parseLiveSourceReturnPath = (
    value: string | undefined,
    fallback: string,
): string => {
    if (
        !value ||
        // Browsers drop tabs and newlines, so `/\t/host` would read as `//host`
        // oxlint-disable-next-line no-control-regex
        /[\u0000-\u001f\u007f]/.test(value) ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.startsWith('/\\') ||
        value.startsWith('/api/')
    ) {
        return fallback;
    }
    return value;
};

/** The app page a viewer returns to, saying how the sign-in went. */
export const getLiveSourceSignInReturnUrl = (
    siteUrl: string,
    returnPath: string,
    result: { connectionUuid: string } | { error: string },
): string => {
    const site = new URL(siteUrl);
    const parsed = new URL(returnPath, site);
    // Only ever back into this app, whatever the path turned out to say
    const url = parsed.origin === site.origin ? parsed : new URL('/', site);
    if ('error' in result) {
        url.searchParams.set('liveSourceSignInError', result.error);
    } else {
        url.searchParams.set('liveSourceSignedIn', result.connectionUuid);
    }
    return url.href;
};

/** Hydra's consent screen, which this server answers itself. */
export const buildHydraAuthorizeUrl = ({
    siteUrl,
    clientId,
    connectionUuid,
    redirectUri,
    state,
    codeChallenge,
}: {
    siteUrl: string;
    clientId: string;
    /** The source the sign-in is for; Hydra binds the code and tokens to it. */
    connectionUuid: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}): string => {
    const url = new URL(HYDRA_AUTHORIZE_PATH, siteUrl);
    url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        resource: connectionUuid,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    }).toString();
    return url.href;
};
