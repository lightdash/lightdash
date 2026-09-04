export const MOBILE_PLATFORMS = ['ios', 'android'] as const;

export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];

export const isMobilePlatform = (value: unknown): value is MobilePlatform =>
    MOBILE_PLATFORMS.includes(value as MobilePlatform);

export type ManagedSignInProvider = 'microsoft';

export const MANAGED_SIGN_IN_PROVIDER: ManagedSignInProvider = 'microsoft';

export const MANAGED_SIGN_IN_SCOPES = ['openid', 'profile', 'email'];

export const MICROSOFT_LOGIN_HOST = 'https://login.microsoftonline.com';

export const MICROSOFT_ORGANIZATIONS_AUTHORITY = `${MICROSOFT_LOGIN_HOST}/organizations`;

export const getMicrosoftAuthority = (tenantId: string | null): string =>
    tenantId === null
        ? MICROSOFT_ORGANIZATIONS_AUTHORITY
        : `${MICROSOFT_LOGIN_HOST}/${tenantId}`;

export const getMicrosoftIssuer = (tenantId: string): string =>
    `${MICROSOFT_LOGIN_HOST}/${tenantId}/v2.0`;

export const getMicrosoftOpenIdConfigurationUrl = (tenantId: string): string =>
    `${MICROSOFT_LOGIN_HOST}/${tenantId}/v2.0/.well-known/openid-configuration`;

export type ManagedSignIn = {
    provider: ManagedSignInProvider;
    clientId: string;
    authority: string;
    tenantId: string | null;
    scopes: string[];
};

export const TOKEN_EXCHANGE_GRANT_TYPE =
    'urn:ietf:params:oauth:grant-type:token-exchange';

export const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';

export const ACCESS_TOKEN_TYPE =
    'urn:ietf:params:oauth:token-type:access_token';

export enum ManagedSignInError {
    TENANT_NOT_CONFIGURED = 'tenant_not_configured',
    TOKEN_INVALID = 'token_invalid',
    TOKEN_EXPIRED = 'token_expired',
    TOKEN_REPLAYED = 'token_replayed',
    EMAIL_UNVERIFIED = 'email_unverified',
    USER_NOT_ALLOWED = 'user_not_allowed',
}

export const MANAGED_SIGN_IN_MAX_TOKEN_AGE_SECONDS = 300;
