import { assertUnreachable, LinearConnectError } from '@lightdash/common';

export const buildLinearAppSetupUrl = (siteUrl: string): string => {
    const callbackUrl = new URL('/api/v1/linear/oauth/callback', siteUrl).href;
    const params = new URLSearchParams({
        distribution: 'private',
        'display.description':
            'Creates issues from Lightdash AI agent review findings.',
        'developer.name': 'Lightdash',
        'oauth.client_name': 'Lightdash AI reviews',
        'oauth.client_uri': siteUrl,
        'oauth.redirect_uris': callbackUrl,
        'oauth.grant_types': 'authorization_code',
    });
    return `https://linear.app/settings/api/applications/new?${params.toString()}`;
};

export const getLinearConnectErrorMessage = (
    error: LinearConnectError,
): string => {
    switch (error) {
        case LinearConnectError.CANCELLED:
            return 'The connection was cancelled in Linear. Click Connect Linear to try again.';
        case LinearConnectError.SESSION_EXPIRED:
            return 'The connection attempt expired. Click Connect Linear to start again.';
        case LinearConnectError.INVALID_CLIENT:
            return 'Linear did not accept the client ID or client secret. Copy both again from the app you created in Linear, then connect again.';
        case LinearConnectError.UNAUTHORIZED_CLIENT:
            return 'This Linear app cannot be used to connect. Create a new app with the Create Linear app button and connect with its client ID.';
        case LinearConnectError.INVALID_GRANT:
            return 'Linear rejected the sign in. Click Connect Linear and approve once, without reloading the page. If it keeps failing, contact support.';
        case LinearConnectError.LINEAR_UNAVAILABLE:
            return 'Linear could not be reached. Try again in a few minutes.';
        case LinearConnectError.UNKNOWN:
            return 'Linear could not finish the connection. Try again, and contact support if it keeps failing.';
        default:
            return assertUnreachable(error, `Unknown Linear error ${error}`);
    }
};
