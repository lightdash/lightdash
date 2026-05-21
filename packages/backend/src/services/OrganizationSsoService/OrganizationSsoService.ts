import { subject } from '@casl/ability';
import {
    AzureAdSsoConfig,
    AzureAdSsoConfigSummary,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    OrganizationSsoMethodFlags,
    OrganizationSsoProvider,
    ParameterError,
    UpsertAzureAdSsoConfig,
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
            throw new Error('Failed to read back upserted SSO configuration');
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
     * Returns the full Azure AD config for a specific org (DB only, no fallback).
     */
    async getAzureAdConfigForOrganization(
        organizationUuid: string,
    ): Promise<AzureAdSsoConfig | undefined> {
        const method = await this.organizationSsoModel.findMethod(
            organizationUuid,
            OrganizationSsoProvider.AZUREAD,
        );
        return method?.config;
    }

    /**
     * Returns the first enabled per-org Azure AD method whose whitelist
     * matches the email's domain. Used by the login/callback routes.
     */
    async findEnabledAzureAdMethodForEmail(
        email: string,
    ): Promise<
        OrganizationSsoMethod<OrganizationSsoProvider.AZUREAD> | undefined
    > {
        const matches = await this.findEnabledMethodsForEmail(email);
        return matches.find(
            (m): m is OrganizationSsoMethod<OrganizationSsoProvider.AZUREAD> =>
                m.provider === OrganizationSsoProvider.AZUREAD,
        );
    }
}
