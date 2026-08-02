import {
    FeatureFlags,
    ForbiddenError,
    OrganizationSsoProvider,
    ParameterError,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationDomainVerificationModel } from '../../models/OrganizationDomainVerificationModel';
import { OrganizationSsoModel } from '../../models/OrganizationSsoModel';
import { UserModel } from '../../models/UserModel';
import { OrganizationSsoService } from './OrganizationSsoService';
import {
    azureAdMethod,
    enabledMethodForOrg,
    mockAccountNoOrg,
    mockAccountNoPermission,
    mockAdminAccount,
    ORG_UUID,
    OTHER_ORG_UUID,
    USER_UUID,
} from './OrganizationSsoService.mock';

const buildService = () => {
    const organizationSsoModel = {
        findMethod: vi.fn(),
        findEnabledMethodsForEmailDomain: vi.fn(),
        findEnabledOktaMethodByStoredIssuer: vi.fn(),
        findGoogleMethodsForEmailDomain: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    };
    const organizationDomainVerificationModel = {
        findVerifiedDomains: vi.fn().mockResolvedValue([]),
    };
    const featureFlagModel = {
        // Enabled by default — individual tests override to exercise the guard.
        get: vi.fn().mockResolvedValue({
            id: FeatureFlags.SsoOrganizationSettings,
            enabled: true,
        }),
    };
    const userModel = {
        findUserByEmail: vi.fn(),
        getOrganizationsForUser: vi.fn(),
    };

    const service = new OrganizationSsoService({
        lightdashConfig: {} as LightdashConfig,
        organizationSsoModel:
            organizationSsoModel as unknown as OrganizationSsoModel,
        organizationAllowedEmailDomainsModel:
            {} as OrganizationAllowedEmailDomainsModel,
        organizationDomainVerificationModel:
            organizationDomainVerificationModel as unknown as OrganizationDomainVerificationModel,
        featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
        userModel: userModel as unknown as UserModel,
    });

    return {
        service,
        organizationSsoModel,
        organizationDomainVerificationModel,
        featureFlagModel,
        userModel,
    };
};

describe('OrganizationSsoService', () => {
    describe('assertFeatureEnabled', () => {
        it('throws ForbiddenError when the per-org SSO feature flag is disabled', async () => {
            const { service, featureFlagModel } = buildService();
            featureFlagModel.get.mockResolvedValue({
                id: FeatureFlags.SsoOrganizationSettings,
                enabled: false,
            });

            await expect(
                service.getAzureAdConfig(mockAdminAccount),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getAzureAdConfig(mockAdminAccount),
            ).rejects.toThrow('Per-organization SSO settings are not enabled');
        });

        it('queries the SsoOrganizationSettings flag for the account organization', async () => {
            const { service, featureFlagModel, organizationSsoModel } =
                buildService();
            organizationSsoModel.findMethod.mockResolvedValue(undefined);

            await service.getAzureAdConfig(mockAdminAccount);

            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: {
                    userUuid: USER_UUID,
                    organizationUuid: ORG_UUID,
                },
                featureFlagId: FeatureFlags.SsoOrganizationSettings,
            });
        });
    });

    describe('assertCanManageSso', () => {
        it('throws ForbiddenError when the account has no organization', async () => {
            const { service } = buildService();

            await expect(
                service.getAzureAdConfig(mockAccountNoOrg),
            ).rejects.toThrow('User is not part of an organization');
        });

        it('throws ForbiddenError when the account cannot manage the organization', async () => {
            const { service } = buildService();

            await expect(
                service.getAzureAdConfig(mockAccountNoPermission),
            ).rejects.toThrow(ForbiddenError);
        });

        it('allows an org admin through (returns null when no config exists)', async () => {
            const { service, organizationSsoModel } = buildService();
            organizationSsoModel.findMethod.mockResolvedValue(undefined);

            await expect(
                service.getAzureAdConfig(mockAdminAccount),
            ).resolves.toBeNull();
            expect(organizationSsoModel.findMethod).toHaveBeenCalledWith(
                ORG_UUID,
                OrganizationSsoProvider.AZUREAD,
            );
        });
    });

    describe('validateEmailDomains', () => {
        it('rejects malformed email domains', async () => {
            const { service, organizationSsoModel } = buildService();

            await expect(
                service.upsertAzureAdConfig(mockAdminAccount, {
                    oauth2ClientId: 'client-id',
                    oauth2ClientSecret: 'secret',
                    oauth2TenantId: 'tenant-id',
                    emailDomains: ['not a domain'],
                }),
            ).rejects.toThrow(ParameterError);
            await expect(
                service.upsertAzureAdConfig(mockAdminAccount, {
                    oauth2ClientId: 'client-id',
                    oauth2ClientSecret: 'secret',
                    oauth2TenantId: 'tenant-id',
                    emailDomains: ['not a domain'],
                }),
            ).rejects.toThrow('Invalid email domain format');
            expect(organizationSsoModel.upsert).not.toHaveBeenCalled();
        });

        it('rejects public email provider domains that no org can claim', async () => {
            const { service, organizationSsoModel } = buildService();

            await expect(
                service.upsertAzureAdConfig(mockAdminAccount, {
                    oauth2ClientId: 'client-id',
                    oauth2ClientSecret: 'secret',
                    oauth2TenantId: 'tenant-id',
                    emailDomains: ['gmail.com'],
                }),
            ).rejects.toThrow("can't be claimed");
            expect(organizationSsoModel.upsert).not.toHaveBeenCalled();
        });

        it('rejects domains the org has not verified when override is enabled', async () => {
            const { service, organizationDomainVerificationModel } =
                buildService();
            organizationDomainVerificationModel.findVerifiedDomains.mockResolvedValue(
                [{ domain: 'verified.com' }],
            );

            await expect(
                service.upsertAzureAdConfig(mockAdminAccount, {
                    oauth2ClientId: 'client-id',
                    oauth2ClientSecret: 'secret',
                    oauth2TenantId: 'tenant-id',
                    overrideEmailDomains: true,
                    emailDomains: ['unverified.com'],
                }),
            ).rejects.toThrow('must be verified before they can be used');
        });

        it('does not require verification when override is disabled', async () => {
            const {
                service,
                organizationSsoModel,
                organizationDomainVerificationModel,
            } = buildService();
            organizationSsoModel.findMethod
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(azureAdMethod());

            await service.upsertAzureAdConfig(mockAdminAccount, {
                oauth2ClientId: 'client-id',
                oauth2ClientSecret: 'secret',
                oauth2TenantId: 'tenant-id',
                overrideEmailDomains: false,
                emailDomains: ['acme.com'],
            });

            expect(
                organizationDomainVerificationModel.findVerifiedDomains,
            ).not.toHaveBeenCalled();
            expect(organizationSsoModel.upsert).toHaveBeenCalledTimes(1);
        });
    });

    describe('secret preservation on update', () => {
        it('preserves the stored client secret when none is provided on update', async () => {
            const { service, organizationSsoModel } = buildService();
            organizationSsoModel.findMethod
                .mockResolvedValueOnce(azureAdMethod()) // existing read
                .mockResolvedValueOnce(azureAdMethod()); // read-back

            await service.upsertAzureAdConfig(mockAdminAccount, {
                oauth2ClientId: 'new-client-id',
                oauth2TenantId: 'new-tenant-id',
            });

            expect(organizationSsoModel.upsert).toHaveBeenCalledWith(
                ORG_UUID,
                OrganizationSsoProvider.AZUREAD,
                expect.objectContaining({
                    oauth2ClientId: 'new-client-id',
                    oauth2ClientSecret: 'stored-secret',
                    oauth2TenantId: 'new-tenant-id',
                }),
                expect.anything(),
                USER_UUID,
            );
        });

        it('uses the provided secret when one is supplied on update', async () => {
            const { service, organizationSsoModel } = buildService();
            organizationSsoModel.findMethod
                .mockResolvedValueOnce(azureAdMethod())
                .mockResolvedValueOnce(azureAdMethod());

            await service.upsertAzureAdConfig(mockAdminAccount, {
                oauth2ClientId: 'new-client-id',
                oauth2ClientSecret: 'rotated-secret',
                oauth2TenantId: 'new-tenant-id',
            });

            expect(organizationSsoModel.upsert).toHaveBeenCalledWith(
                ORG_UUID,
                OrganizationSsoProvider.AZUREAD,
                expect.objectContaining({
                    oauth2ClientSecret: 'rotated-secret',
                }),
                expect.anything(),
                USER_UUID,
            );
        });

        it('throws ParameterError when creating without a client secret', async () => {
            const { service, organizationSsoModel } = buildService();
            organizationSsoModel.findMethod.mockResolvedValue(undefined);

            await expect(
                service.upsertAzureAdConfig(mockAdminAccount, {
                    oauth2ClientId: 'client-id',
                    oauth2TenantId: 'tenant-id',
                }),
            ).rejects.toThrow('oauth2ClientSecret is required');
            expect(organizationSsoModel.upsert).not.toHaveBeenCalled();
        });
    });

    describe('findEnabledMethodsForEmail cross-org filter', () => {
        it('returns [] for an email without a domain', async () => {
            const { service, organizationSsoModel } = buildService();

            await expect(
                service.findEnabledMethodsForEmail('no-domain'),
            ).resolves.toEqual([]);
            expect(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).not.toHaveBeenCalled();
        });

        it('lowercases the domain before querying', async () => {
            const { service, organizationSsoModel } = buildService();
            organizationSsoModel.findEnabledMethodsForEmailDomain.mockResolvedValue(
                [],
            );

            await service.findEnabledMethodsForEmail('User@ACME.com');

            expect(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).toHaveBeenCalledWith('acme.com');
        });

        it('returns no matches without looking up the user', async () => {
            const { service, organizationSsoModel, userModel } = buildService();
            organizationSsoModel.findEnabledMethodsForEmailDomain.mockResolvedValue(
                [],
            );

            await expect(
                service.findEnabledMethodsForEmail('user@acme.com'),
            ).resolves.toEqual([]);
            expect(userModel.findUserByEmail).not.toHaveBeenCalled();
        });

        it('returns every match for a brand-new user with no account yet', async () => {
            const { service, organizationSsoModel, userModel } = buildService();
            const matches = [
                enabledMethodForOrg(ORG_UUID),
                enabledMethodForOrg(OTHER_ORG_UUID),
            ];
            organizationSsoModel.findEnabledMethodsForEmailDomain.mockResolvedValue(
                matches,
            );
            userModel.findUserByEmail.mockResolvedValue(undefined);

            await expect(
                service.findEnabledMethodsForEmail('user@acme.com'),
            ).resolves.toEqual(matches);
            expect(userModel.getOrganizationsForUser).not.toHaveBeenCalled();
        });

        it('filters matches to the orgs an existing user already belongs to', async () => {
            const { service, organizationSsoModel, userModel } = buildService();
            const ownOrgMethod = enabledMethodForOrg(ORG_UUID);
            const otherOrgMethod = enabledMethodForOrg(OTHER_ORG_UUID);
            organizationSsoModel.findEnabledMethodsForEmailDomain.mockResolvedValue(
                [ownOrgMethod, otherOrgMethod],
            );
            userModel.findUserByEmail.mockResolvedValue({
                userUuid: USER_UUID,
            });
            userModel.getOrganizationsForUser.mockResolvedValue([
                { organizationUuid: ORG_UUID },
            ]);

            await expect(
                service.findEnabledMethodsForEmail('user@acme.com'),
            ).resolves.toEqual([ownOrgMethod]);
        });
    });

    describe('findEnabledOktaMethodForIssuer', () => {
        it('normalizes issuer lookup before querying the SSO model', async () => {
            const { service, organizationSsoModel } = buildService();
            const method = enabledMethodForOrg(
                ORG_UUID,
                OrganizationSsoProvider.OKTA,
            );
            organizationSsoModel.findEnabledOktaMethodByStoredIssuer.mockResolvedValue(
                method,
            );

            await expect(
                service.findEnabledOktaMethodForIssuer(
                    'https://EXAMPLE.okta.com/?from=dashboard',
                ),
            ).resolves.toEqual(method);
            expect(
                organizationSsoModel.findEnabledOktaMethodByStoredIssuer,
            ).toHaveBeenCalledWith('https://example.okta.com');
        });

        it('returns undefined without querying when issuer is invalid', async () => {
            const { service, organizationSsoModel } = buildService();

            await expect(
                service.findEnabledOktaMethodForIssuer('not-a-url'),
            ).resolves.toBeUndefined();
            expect(
                organizationSsoModel.findEnabledOktaMethodByStoredIssuer,
            ).not.toHaveBeenCalled();
        });
    });
});
