import {
    ParameterError,
    type ExternalConnectionAuthType,
} from '@lightdash/common';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Google integrations connect through the instance's Google sign-in only. */
export const assertGoogleSignIn = (
    label: string,
    {
        type,
        oauthTokenUrl,
    }: {
        type: ExternalConnectionAuthType;
        oauthTokenUrl?: string | null;
    },
) => {
    if (
        type !== 'oauth_authorization_code' ||
        oauthTokenUrl !== GOOGLE_TOKEN_URL
    ) {
        throw new ParameterError(
            `${label} connections authenticate by signing in with Google`,
        );
    }
};
