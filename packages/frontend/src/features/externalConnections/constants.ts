import i18n from '../../i18n/i18n';

// Suggested Google OAuth scopes shown in the connection forms; admins can type
// any valid scope.
export const SUGGESTED_GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/bigquery',
    'https://www.googleapis.com/auth/cloud-platform',
];

// Mirrors the backend RFC 6749 scope-token validator so bad scopes are caught
// inline for both Google and client-credentials connections.
const OAUTH_SCOPE_REGEX = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const GOOGLE_OAUTH_SCOPE_REGEX = /^(https:\/\/\S+|openid|email|profile)$/;

export const isValidOAuthScope = (scope: string): boolean =>
    OAUTH_SCOPE_REGEX.test(scope);

export const isValidGoogleOAuthScope = (scope: string): boolean =>
    GOOGLE_OAUTH_SCOPE_REGEX.test(scope);

export const validateOAuthTokenUrl = (value: string): string | null => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return i18n.t('externalConnections.validation.tokenUrlInvalid', {
            ns: 'sync',
        });
    }
    if (url.protocol !== 'https:') {
        return i18n.t('externalConnections.validation.tokenUrlHttps', {
            ns: 'sync',
        });
    }
    if (url.username || url.password || url.hash) {
        return i18n.t('externalConnections.validation.tokenUrlCredentials', {
            ns: 'sync',
        });
    }
    return null;
};
