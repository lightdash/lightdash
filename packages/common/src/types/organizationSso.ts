export enum OrganizationSsoProvider {
    AZUREAD = 'azuread',
    OKTA = 'okta',
    GENERIC_OIDC = 'oidc',
    ONELOGIN = 'oneLogin',
    GOOGLE = 'google',
}

export const isOrganizationSsoProvider = (
    value: string,
): value is OrganizationSsoProvider =>
    Object.values(OrganizationSsoProvider).includes(
        value as OrganizationSsoProvider,
    );

export type AzureAdSsoConfig = {
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    oauth2TenantId: string;
};

export type OktaSsoConfig = {
    oauth2Issuer: string;
    oktaDomain: string;
    oauth2ClientId: string;
    oauth2ClientSecret: string;
    /** Optional custom authorization server (Okta API Access Management). */
    authorizationServerId: string | null;
    /** Optional extra scopes (space-separated) appended to the auth request. */
    extraScopes: string | null;
};

/**
 * Per-row flags shared by every SSO method configured at the org level.
 * Stored as plain columns alongside the encrypted provider-specific config.
 */
export type OrganizationSsoMethodFlags = {
    /** When false the method is hidden from precheck even if discovery would match. */
    enabled: boolean;
    /**
     * When true, the method's own `emailDomains` list governs discovery.
     * When false, the org's `allowed_email_domains` is used instead.
     */
    overrideEmailDomains: boolean;
    /** Strict whitelist (only consulted when `overrideEmailDomains` is true). */
    emailDomains: string[];
    /**
     * Controls whether email+password sign-in is shown alongside this method
     * when it matches a user. When multiple matching SSO methods disagree,
     * lenient rule applies (ANY method that allows → show password).
     */
    allowPassword: boolean;
};

export type AzureAdSsoConfigSummary = Pick<
    AzureAdSsoConfig,
    'oauth2ClientId' | 'oauth2TenantId'
> &
    OrganizationSsoMethodFlags & {
        hasClientSecret: boolean;
    };

export type UpsertAzureAdSsoConfig = {
    oauth2ClientId: string;
    /**
     * When omitted on update, the stored secret is preserved. Required on create.
     */
    oauth2ClientSecret?: string;
    oauth2TenantId: string;
} & Partial<OrganizationSsoMethodFlags>;

export type ApiAzureAdSsoConfigResponse = {
    status: 'ok';
    results: AzureAdSsoConfigSummary | null;
};

export type ApiUpsertAzureAdSsoConfigResponse = {
    status: 'ok';
    results: AzureAdSsoConfigSummary;
};

export type OktaSsoConfigSummary = Pick<
    OktaSsoConfig,
    | 'oauth2Issuer'
    | 'oktaDomain'
    | 'oauth2ClientId'
    | 'authorizationServerId'
    | 'extraScopes'
> &
    OrganizationSsoMethodFlags & {
        hasClientSecret: boolean;
    };

export type UpsertOktaSsoConfig = {
    oauth2Issuer: string;
    oktaDomain: string;
    oauth2ClientId: string;
    /**
     * When omitted on update, the stored secret is preserved. Required on create.
     */
    oauth2ClientSecret?: string;
    authorizationServerId?: string | null;
    extraScopes?: string | null;
} & Partial<OrganizationSsoMethodFlags>;

export type ApiOktaSsoConfigResponse = {
    status: 'ok';
    results: OktaSsoConfigSummary | null;
};

export type ApiUpsertOktaSsoConfigResponse = {
    status: 'ok';
    results: OktaSsoConfigSummary;
};

export type GenericOidcSsoConfig = {
    clientId: string;
    clientSecret: string;
    /** OIDC discovery document URL (`.well-known/openid-configuration`). */
    metadataDocumentEndpoint: string;
    /** Optional extra scopes (space-separated) appended to the auth request. */
    scopes: string | null;
};

export type GenericOidcSsoConfigSummary = Pick<
    GenericOidcSsoConfig,
    'clientId' | 'metadataDocumentEndpoint' | 'scopes'
> &
    OrganizationSsoMethodFlags & {
        hasClientSecret: boolean;
    };

export type UpsertGenericOidcSsoConfig = {
    clientId: string;
    /**
     * When omitted on update, the stored secret is preserved. Required on create.
     */
    clientSecret?: string;
    metadataDocumentEndpoint: string;
    scopes?: string | null;
} & Partial<OrganizationSsoMethodFlags>;

export type ApiGenericOidcSsoConfigResponse = {
    status: 'ok';
    results: GenericOidcSsoConfigSummary | null;
};

export type ApiUpsertGenericOidcSsoConfigResponse = {
    status: 'ok';
    results: GenericOidcSsoConfigSummary;
};

export type OneLoginSsoConfig = {
    oauth2Issuer: string;
    oauth2ClientId: string;
    oauth2ClientSecret: string;
};

export type OneLoginSsoConfigSummary = Pick<
    OneLoginSsoConfig,
    'oauth2Issuer' | 'oauth2ClientId'
> &
    OrganizationSsoMethodFlags & {
        hasClientSecret: boolean;
    };

export type UpsertOneLoginSsoConfig = {
    oauth2Issuer: string;
    oauth2ClientId: string;
    /**
     * When omitted on update, the stored secret is preserved. Required on create.
     */
    oauth2ClientSecret?: string;
} & Partial<OrganizationSsoMethodFlags>;

export type ApiOneLoginSsoConfigResponse = {
    status: 'ok';
    results: OneLoginSsoConfigSummary | null;
};

export type ApiUpsertOneLoginSsoConfigResponse = {
    status: 'ok';
    results: OneLoginSsoConfigSummary;
};

/**
 * Google is unique among the per-org SSO providers: it has no per-org
 * credentials and is enabled by default using the shared instance OAuth app.
 * The stored config is therefore empty today — a `google` row exists only to
 * express an org's explicit policy (typically: disable Google for its domains,
 * or scope the `allowPassword` / `emailDomains` flags). The blob is a
 * schema-less encrypted JSON object, so own-credential fields (e.g. a customer
 * Google OAuth client) can be added later without a migration.
 */
export type GoogleSsoConfig = Record<string, never>;

export type GoogleSsoConfigSummary = OrganizationSsoMethodFlags;

export type UpsertGoogleSsoConfig = Partial<OrganizationSsoMethodFlags>;

export type ApiGoogleSsoConfigResponse = {
    status: 'ok';
    results: GoogleSsoConfigSummary | null;
};

export type ApiUpsertGoogleSsoConfigResponse = {
    status: 'ok';
    results: GoogleSsoConfigSummary;
};
