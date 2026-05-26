import { subject } from '@casl/ability';
import {
    AzureAdSsoConfig,
    AzureAdSsoConfigSummary,
    FeatureFlags,
    ForbiddenError,
    GenericOidcSsoConfig,
    GenericOidcSsoConfigSummary,
    GoogleSsoConfig,
    GoogleSsoConfigSummary,
    NotFoundError,
    OktaSsoConfig,
    OktaSsoConfigSummary,
    OneLoginSsoConfig,
    OneLoginSsoConfigSummary,
    OrganizationSsoMethodFlags,
    OrganizationSsoProvider,
    ParameterError,
    UnexpectedServerError,
    UpsertAzureAdSsoConfig,
    UpsertGenericOidcSsoConfig,
    UpsertGoogleSsoConfig,
    UpsertOktaSsoConfig,
    UpsertOneLoginSsoConfig,
    type RegisteredAccount,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import {
    OrganizationSsoMethod,
    OrganizationSsoModel,
} from '../../models/OrganizationSsoModel';
import { UserModel } from '../../models/UserModel';
import { validatePublicHttpUrl } from '../../utils/ssrfProtection';
import { BaseService } from '../BaseService';

type OrganizationSsoServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationSsoModel: OrganizationSsoModel;
    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
    featureFlagModel: FeatureFlagModel;
    userModel: UserModel;
};

const toSummary = (
    method: OrganizationSsoMethod<OrganizationSsoProvider.AZUREAD>,
): AzureAdSsoConfigSummary => ({
    oauth2ClientId: method.config.oauth2ClientId,
    oauth2TenantId: method.config.oauth2TenantId,
    hasClientSecret: !!method.config.oauth2ClientSecret,
    enabled: method.enabled,
    overrideEmailDomains: method.overrideEmailDomains,
    emailDomains: method.emailDomains,
    allowPassword: method.allowPassword,
});

const toOktaSummary = (
    method: OrganizationSsoMethod<OrganizationSsoProvider.OKTA>,
): OktaSsoConfigSummary => ({
    oauth2Issuer: method.config.oauth2Issuer,
    oktaDomain: method.config.oktaDomain,
    oauth2ClientId: method.config.oauth2ClientId,
    authorizationServerId: method.config.authorizationServerId,
    extraScopes: method.config.extraScopes,
    hasClientSecret: !!method.config.oauth2ClientSecret,
    enabled: method.enabled,
    overrideEmailDomains: method.overrideEmailDomains,
    emailDomains: method.emailDomains,
    allowPassword: method.allowPassword,
});

const toGenericOidcSummary = (
    method: OrganizationSsoMethod<OrganizationSsoProvider.GENERIC_OIDC>,
): GenericOidcSsoConfigSummary => ({
    clientId: method.config.clientId,
    metadataDocumentEndpoint: method.config.metadataDocumentEndpoint,
    scopes: method.config.scopes,
    hasClientSecret: !!method.config.clientSecret,
    enabled: method.enabled,
    overrideEmailDomains: method.overrideEmailDomains,
    emailDomains: method.emailDomains,
    allowPassword: method.allowPassword,
});

const toOneLoginSummary = (
    method: OrganizationSsoMethod<OrganizationSsoProvider.ONELOGIN>,
): OneLoginSsoConfigSummary => ({
    oauth2Issuer: method.config.oauth2Issuer,
    oauth2ClientId: method.config.oauth2ClientId,
    hasClientSecret: !!method.config.oauth2ClientSecret,
    enabled: method.enabled,
    overrideEmailDomains: method.overrideEmailDomains,
    emailDomains: method.emailDomains,
    allowPassword: method.allowPassword,
});

const toGoogleSummary = (
    method: OrganizationSsoMethod<OrganizationSsoProvider.GOOGLE>,
): GoogleSsoConfigSummary => ({
    enabled: method.enabled,
    overrideEmailDomains: method.overrideEmailDomains,
    emailDomains: method.emailDomains,
    allowPassword: method.allowPassword,
});

export class OrganizationSsoService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationSsoModel: OrganizationSsoModel;

    private readonly organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly userModel: UserModel;

    constructor({
        lightdashConfig,
        organizationSsoModel,
        organizationAllowedEmailDomainsModel,
        featureFlagModel,
        userModel,
    }: OrganizationSsoServiceArguments) {
        super({ serviceName: 'OrganizationSsoService' });
        this.lightdashConfig = lightdashConfig;
        this.organizationSsoModel = organizationSsoModel;
        this.organizationAllowedEmailDomainsModel =
            organizationAllowedEmailDomainsModel;
        this.featureFlagModel = featureFlagModel;
        this.userModel = userModel;
    }

    private async assertFeatureEnabled(
        account: RegisteredAccount,
    ): Promise<void> {
        const flag = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization?.organizationUuid,
                organizationName: account.organization?.name,
            },
            featureFlagId: FeatureFlags.SsoOrganizationSettings,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'Per-organization SSO settings are not enabled for this organization',
            );
        }
    }

    /**
     * Domains no single organization should ever be able to claim.
     * Not exhaustive — covers the obvious public providers and corporate
     * domains we know can't legitimately belong to a single Lightdash org.
     */
    private static readonly DISALLOWED_DOMAINS = new Set([
        'gmail.com',
        'googlemail.com',
        'google.com',
        'microsoft.com',
        'onmicrosoft.com',
        'outlook.com',
        'hotmail.com',
        'live.com',
        'yahoo.com',
        'icloud.com',
    ]);

    private static validateEmailDomains(domains: string[]): void {
        const normalized = domains.map((d) => d.trim().toLowerCase());

        // Basic shape check — protects against typos like trailing dots or
        // whitespace inside the domain.
        const invalid = normalized.filter(
            (d) =>
                !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
                    d,
                ),
        );
        if (invalid.length > 0) {
            throw new ParameterError(
                `Invalid email domain format: ${invalid.join(', ')}`,
            );
        }

        const disallowed = normalized.filter((d) =>
            OrganizationSsoService.DISALLOWED_DOMAINS.has(d),
        );
        if (disallowed.length > 0) {
            throw new ParameterError(
                `These domains can't be claimed: ${disallowed.join(
                    ', ',
                )}. Use a domain or subdomain that identifies your organization.`,
            );
        }
    }

    /**
     * SSO provider URLs (the OIDC discovery document, the Okta domain) are
     * fetched server-side during issuer discovery, so they must resolve to a
     * public https address. Rejects localhost, private and internal-network
     * addresses (DNS-resolved). Validated when the config is saved.
     */
    private static async assertPublicSsoUrl(
        rawUrl: string,
        label: string,
    ): Promise<void> {
        try {
            await validatePublicHttpUrl(rawUrl);
        } catch {
            throw new ParameterError(
                `${label} must be a valid public https URL — localhost, private and internal network addresses are not allowed.`,
            );
        }
    }

    private assertCanManageSso(account: RegisteredAccount): string {
        const organizationUuid = account.organization?.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    async getAzureAdConfig(
        account: RegisteredAccount,
    ): Promise<AzureAdSsoConfigSummary | null> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
        );
        return method ? toSummary(method) : null;
    }

    async upsertAzureAdConfig(
        account: RegisteredAccount,
        data: UpsertAzureAdSsoConfig,
    ): Promise<AzureAdSsoConfigSummary> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);

        if (!data.oauth2ClientId?.trim() || !data.oauth2TenantId?.trim()) {
            throw new ParameterError(
                'oauth2ClientId and oauth2TenantId are required',
            );
        }

        if (data.emailDomains && data.emailDomains.length > 0) {
            OrganizationSsoService.validateEmailDomains(data.emailDomains);
        }

        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
        );

        const clientSecret =
            data.oauth2ClientSecret?.trim() ||
            existing?.config.oauth2ClientSecret;
        if (!clientSecret) {
            throw new ParameterError('oauth2ClientSecret is required');
        }

        const config: AzureAdSsoConfig = {
            oauth2ClientId: data.oauth2ClientId.trim(),
            oauth2ClientSecret: clientSecret,
            oauth2TenantId: data.oauth2TenantId.trim(),
        };

        const flags: Partial<OrganizationSsoMethodFlags> = {
            enabled: data.enabled,
            overrideEmailDomains: data.overrideEmailDomains,
            emailDomains: data.emailDomains,
            allowPassword: data.allowPassword,
        };

        await this.organizationSsoModel.upsert(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
            config,
            flags,
            account.user.userUuid,
        );

        const refreshed = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
        );
        if (!refreshed) {
            throw new UnexpectedServerError(
                'Failed to read back upserted SSO configuration',
            );
        }
        return toSummary(refreshed);
    }

    async deleteAzureAdConfig(account: RegisteredAccount): Promise<void> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
        );
        if (!existing) {
            throw new NotFoundError('No Azure AD SSO configuration found');
        }
        await this.organizationSsoModel.delete(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
        );
    }

    async getOktaConfig(
        account: RegisteredAccount,
    ): Promise<OktaSsoConfigSummary | null> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.OKTA,
        );
        return method ? toOktaSummary(method) : null;
    }

    async upsertOktaConfig(
        account: RegisteredAccount,
        data: UpsertOktaSsoConfig,
    ): Promise<OktaSsoConfigSummary> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);

        if (
            !data.oauth2ClientId?.trim() ||
            !data.oauth2Issuer?.trim() ||
            !data.oktaDomain?.trim()
        ) {
            throw new ParameterError(
                'oauth2ClientId, oauth2Issuer and oktaDomain are required',
            );
        }

        // The Okta domain builds the issuer URL fetched server-side during
        // discovery — require a public https URL.
        await OrganizationSsoService.assertPublicSsoUrl(
            `https://${data.oktaDomain.trim().replace(/^https?:\/\//, '')}`,
            'Okta domain',
        );

        if (data.emailDomains && data.emailDomains.length > 0) {
            OrganizationSsoService.validateEmailDomains(data.emailDomains);
        }

        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.OKTA,
        );

        const clientSecret =
            data.oauth2ClientSecret?.trim() ||
            existing?.config.oauth2ClientSecret;
        if (!clientSecret) {
            throw new ParameterError('oauth2ClientSecret is required');
        }

        const config: OktaSsoConfig = {
            oauth2Issuer: data.oauth2Issuer.trim(),
            oktaDomain: data.oktaDomain.trim(),
            oauth2ClientId: data.oauth2ClientId.trim(),
            oauth2ClientSecret: clientSecret,
            authorizationServerId: data.authorizationServerId?.trim() || null,
            extraScopes: data.extraScopes?.trim() || null,
        };

        const flags: Partial<OrganizationSsoMethodFlags> = {
            enabled: data.enabled,
            overrideEmailDomains: data.overrideEmailDomains,
            emailDomains: data.emailDomains,
            allowPassword: data.allowPassword,
        };

        await this.organizationSsoModel.upsert(
            organizationUuid,
            OrganizationSsoProvider.OKTA,
            config,
            flags,
            account.user.userUuid,
        );

        const refreshed = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.OKTA,
        );
        if (!refreshed) {
            throw new UnexpectedServerError(
                'Failed to read back upserted SSO configuration',
            );
        }
        return toOktaSummary(refreshed);
    }

    async deleteOktaConfig(account: RegisteredAccount): Promise<void> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.OKTA,
        );
        if (!existing) {
            throw new NotFoundError('No Okta SSO configuration found');
        }
        await this.organizationSsoModel.delete(
            organizationUuid,
            OrganizationSsoProvider.OKTA,
        );
    }

    async getGenericOidcConfig(
        account: RegisteredAccount,
    ): Promise<GenericOidcSsoConfigSummary | null> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GENERIC_OIDC,
        );
        return method ? toGenericOidcSummary(method) : null;
    }

    async upsertGenericOidcConfig(
        account: RegisteredAccount,
        data: UpsertGenericOidcSsoConfig,
    ): Promise<GenericOidcSsoConfigSummary> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);

        if (!data.clientId?.trim() || !data.metadataDocumentEndpoint?.trim()) {
            throw new ParameterError(
                'clientId and metadataDocumentEndpoint are required',
            );
        }

        // The discovery document URL is fetched server-side during discovery —
        // require a public https URL.
        await OrganizationSsoService.assertPublicSsoUrl(
            data.metadataDocumentEndpoint.trim(),
            'OIDC discovery document URL',
        );

        if (data.emailDomains && data.emailDomains.length > 0) {
            OrganizationSsoService.validateEmailDomains(data.emailDomains);
        }

        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GENERIC_OIDC,
        );

        const clientSecret =
            data.clientSecret?.trim() || existing?.config.clientSecret;
        if (!clientSecret) {
            throw new ParameterError('clientSecret is required');
        }

        const config: GenericOidcSsoConfig = {
            clientId: data.clientId.trim(),
            clientSecret,
            metadataDocumentEndpoint: data.metadataDocumentEndpoint.trim(),
            scopes: data.scopes?.trim() || null,
        };

        const flags: Partial<OrganizationSsoMethodFlags> = {
            enabled: data.enabled,
            overrideEmailDomains: data.overrideEmailDomains,
            emailDomains: data.emailDomains,
            allowPassword: data.allowPassword,
        };

        await this.organizationSsoModel.upsert(
            organizationUuid,
            OrganizationSsoProvider.GENERIC_OIDC,
            config,
            flags,
            account.user.userUuid,
        );

        const refreshed = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GENERIC_OIDC,
        );
        if (!refreshed) {
            throw new UnexpectedServerError(
                'Failed to read back upserted SSO configuration',
            );
        }
        return toGenericOidcSummary(refreshed);
    }

    async deleteGenericOidcConfig(account: RegisteredAccount): Promise<void> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GENERIC_OIDC,
        );
        if (!existing) {
            throw new NotFoundError('No OIDC SSO configuration found');
        }
        await this.organizationSsoModel.delete(
            organizationUuid,
            OrganizationSsoProvider.GENERIC_OIDC,
        );
    }

    async getOneLoginConfig(
        account: RegisteredAccount,
    ): Promise<OneLoginSsoConfigSummary | null> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.ONELOGIN,
        );
        return method ? toOneLoginSummary(method) : null;
    }

    async upsertOneLoginConfig(
        account: RegisteredAccount,
        data: UpsertOneLoginSsoConfig,
    ): Promise<OneLoginSsoConfigSummary> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);

        if (!data.oauth2ClientId?.trim() || !data.oauth2Issuer?.trim()) {
            throw new ParameterError(
                'oauth2ClientId and oauth2Issuer are required',
            );
        }

        // The issuer builds the token/userinfo URLs fetched server-side during
        // the callback — require a public https URL.
        await OrganizationSsoService.assertPublicSsoUrl(
            data.oauth2Issuer.trim(),
            'OneLogin issuer URL',
        );

        if (data.emailDomains && data.emailDomains.length > 0) {
            OrganizationSsoService.validateEmailDomains(data.emailDomains);
        }

        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.ONELOGIN,
        );

        const clientSecret =
            data.oauth2ClientSecret?.trim() ||
            existing?.config.oauth2ClientSecret;
        if (!clientSecret) {
            throw new ParameterError('oauth2ClientSecret is required');
        }

        const config: OneLoginSsoConfig = {
            oauth2Issuer: data.oauth2Issuer.trim(),
            oauth2ClientId: data.oauth2ClientId.trim(),
            oauth2ClientSecret: clientSecret,
        };

        const flags: Partial<OrganizationSsoMethodFlags> = {
            enabled: data.enabled,
            overrideEmailDomains: data.overrideEmailDomains,
            emailDomains: data.emailDomains,
            allowPassword: data.allowPassword,
        };

        await this.organizationSsoModel.upsert(
            organizationUuid,
            OrganizationSsoProvider.ONELOGIN,
            config,
            flags,
            account.user.userUuid,
        );

        const refreshed = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.ONELOGIN,
        );
        if (!refreshed) {
            throw new UnexpectedServerError(
                'Failed to read back upserted SSO configuration',
            );
        }
        return toOneLoginSummary(refreshed);
    }

    async deleteOneLoginConfig(account: RegisteredAccount): Promise<void> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.ONELOGIN,
        );
        if (!existing) {
            throw new NotFoundError('No OneLogin SSO configuration found');
        }
        await this.organizationSsoModel.delete(
            organizationUuid,
            OrganizationSsoProvider.ONELOGIN,
        );
    }

    async getGoogleConfig(
        account: RegisteredAccount,
    ): Promise<GoogleSsoConfigSummary | null> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GOOGLE,
        );
        return method ? toGoogleSummary(method) : null;
    }

    /**
     * Google has no per-org credentials (it uses the shared instance OAuth
     * app), so the stored config is empty and only the flags are meaningful.
     * A row exists purely to record an org's explicit policy — most commonly
     * `enabled: false` to disable Google sign-in for the org's domains.
     */
    async upsertGoogleConfig(
        account: RegisteredAccount,
        data: UpsertGoogleSsoConfig,
    ): Promise<GoogleSsoConfigSummary> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);

        if (data.emailDomains && data.emailDomains.length > 0) {
            OrganizationSsoService.validateEmailDomains(data.emailDomains);
        }

        const config: GoogleSsoConfig = {};

        const flags: Partial<OrganizationSsoMethodFlags> = {
            enabled: data.enabled,
            overrideEmailDomains: data.overrideEmailDomains,
            emailDomains: data.emailDomains,
            allowPassword: data.allowPassword,
        };

        await this.organizationSsoModel.upsert(
            organizationUuid,
            OrganizationSsoProvider.GOOGLE,
            config,
            flags,
            account.user.userUuid,
        );

        const refreshed = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GOOGLE,
        );
        if (!refreshed) {
            throw new UnexpectedServerError(
                'Failed to read back upserted SSO configuration',
            );
        }
        return toGoogleSummary(refreshed);
    }

    async deleteGoogleConfig(account: RegisteredAccount): Promise<void> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageSso(account);
        const existing = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.GOOGLE,
        );
        if (!existing) {
            throw new NotFoundError('No Google SSO configuration found');
        }
        await this.organizationSsoModel.delete(
            organizationUuid,
            OrganizationSsoProvider.GOOGLE,
        );
    }

    /**
     * Returns enabled SSO methods (DB-stored, per-org) whose effective
     * whitelist matches the given email's domain.
     *
     * Security: when the email belongs to an existing Lightdash user, the
     * returned set is filtered to orgs the user already belongs to —
     * preventing a malicious admin of another org from re-routing the
     * user's login flow to their tenant via a hijacked domain claim.
     */
    async findEnabledMethodsForEmail(
        email: string,
    ): Promise<OrganizationSsoMethod<OrganizationSsoProvider>[]> {
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain) return [];
        const matches =
            await this.organizationSsoModel.findEnabledMethodsForEmailDomain(
                domain,
            );
        if (matches.length === 0) return matches;

        const existingUser = await this.userModel.findUserByEmail(email);
        if (!existingUser) return matches; // brand-new user → see all matches

        const userOrgs = await this.userModel.getOrganizationsForUser(
            existingUser.userUuid,
        );
        const userOrgUuids = new Set(userOrgs.map((o) => o.organizationUuid));
        return matches.filter((m) => userOrgUuids.has(m.organizationUuid));
    }

    /**
     * Returns the full config for a specific org + provider (DB only, no env
     * fallback). Used by the login/callback routes to build the per-org
     * passport strategy.
     */
    async getConfigForOrganization<P extends OrganizationSsoProvider>(
        organizationUuid: string,
        provider: P,
    ): Promise<OrganizationSsoMethod<P>['config'] | undefined> {
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            provider,
        );
        return method?.config;
    }

    /**
     * Returns the first enabled per-org method for the given provider whose
     * whitelist matches the email's domain. Used by the login/callback routes.
     */
    async findEnabledMethodForEmail<P extends OrganizationSsoProvider>(
        email: string,
        provider: P,
    ): Promise<OrganizationSsoMethod<P> | undefined> {
        const matches = await this.findEnabledMethodsForEmail(email);
        return matches.find(
            (m): m is OrganizationSsoMethod<P> => m.provider === provider,
        );
    }
}
