export enum OrganizationSsoProvider {
    AZUREAD = 'azuread',
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
