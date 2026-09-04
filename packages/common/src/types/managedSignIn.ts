/**
 * Managed sign-in: the mobile apps authenticate against Microsoft Entra
 * directly through MSAL and the broker, then exchange the resulting ID token
 * for Lightdash OAuth tokens. Browser sign-in is the existing path where the
 * server talks to the identity provider.
 *
 * Every field name, grant identifier and error code for managed sign-in lives
 * in this module so a contract change is a one-file edit.
 */

export const MOBILE_PLATFORMS = ['ios', 'android'] as const;

export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

export const isMobilePlatform = (value: unknown): value is MobilePlatform =>
    MOBILE_PLATFORMS.includes(value as MobilePlatform);

export type ManagedSignInProvider = 'microsoft';

export const MANAGED_SIGN_IN_PROVIDER: ManagedSignInProvider = 'microsoft';

/** Scopes the apps request from Microsoft for the ID token. */
export const MANAGED_SIGN_IN_SCOPES = ['openid', 'profile', 'email'];

export const MICROSOFT_LOGIN_HOST = 'https://login.microsoftonline.com';

/** Authority used when the server cannot name a tenant. */
export const MICROSOFT_ORGANIZATIONS_AUTHORITY = `${MICROSOFT_LOGIN_HOST}/organizations`;

export const getMicrosoftAuthority = (tenantId: string | null): string =>
    tenantId === null
        ? MICROSOFT_ORGANIZATIONS_AUTHORITY
        : `${MICROSOFT_LOGIN_HOST}/${tenantId}`;

export const getMicrosoftIssuer = (tenantId: string): string =>
    `${MICROSOFT_LOGIN_HOST}/${tenantId}/v2.0`;

export const getMicrosoftOpenIdConfigurationUrl = (tenantId: string): string =>
    `${MICROSOFT_LOGIN_HOST}/${tenantId}/v2.0/.well-known/openid-configuration`;

/**
 * Advertised on login-options when the server names a Microsoft tenant for the
 * person signing in and the platform's mobile registration is configured.
 */
export type ManagedSignIn = {
    provider: ManagedSignInProvider;
    clientId: string;
    authority: string;
    tenantId: string | null;
    scopes: string[];
};

/** RFC 8693 token exchange. */
export const TOKEN_EXCHANGE_GRANT_TYPE =
    'urn:ietf:params:oauth:grant-type:token-exchange';

export const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

export const ACCESS_TOKEN_TYPE =
    'urn:ietf:params:oauth:token-type:access_token';

/**
 * The only `error_description` values the exchange returns. Every rejection is
 * an OAuth `invalid_grant`; the apps map these to their own copy.
 */
export enum ManagedSignInError {
    TENANT_NOT_CONFIGURED = 'tenant_not_configured',
    TOKEN_INVALID = 'token_invalid',
    TOKEN_EXPIRED = 'token_expired',
    TOKEN_REPLAYED = 'token_replayed',
    EMAIL_UNVERIFIED = 'email_unverified',
    USER_NOT_ALLOWED = 'user_not_allowed',
}

/** Longest accepted age of the Microsoft token, in seconds. */
export const MANAGED_SIGN_IN_MAX_TOKEN_AGE_SECONDS = 300;
