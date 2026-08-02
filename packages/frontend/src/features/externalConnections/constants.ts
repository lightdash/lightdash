// Suggested Google OAuth scopes shown in the connection forms; admins can type
// any valid scope.
export const SUGGESTED_GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/bigquery',
    'https://www.googleapis.com/auth/cloud-platform',
];

// Mirrors the backend OAUTH_SCOPE validator so bad scopes are caught inline
// (externalConnectionConfigValidation.ts). Google scopes are full https URLs,
// except the OIDC scopes openid/email/profile.
const OAUTH_SCOPE_REGEX = /^(https:\/\/\S+|openid|email|profile)$/;

export const isValidOAuthScope = (scope: string): boolean =>
    OAUTH_SCOPE_REGEX.test(scope);
