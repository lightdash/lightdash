import { Ability } from '@casl/ability';
import {
    AzureAdSsoConfig,
    OrganizationMemberRole,
    OrganizationSsoProvider,
    PossibleAbilities,
    SessionAccount,
} from '@lightdash/common';
import { OrganizationSsoMethod } from '../../models/OrganizationSsoModel';

export const ORG_UUID = 'test-org-uuid';
export const OTHER_ORG_UUID = 'other-org-uuid';
export const USER_UUID = 'test-user-uuid';

const baseUser = {
    type: 'registered' as const,
    id: '1',
    email: 'admin@acme.com',
    firstName: 'Test',
    lastName: 'User',
    userUuid: USER_UUID,
    isActive: true,
    role: OrganizationMemberRole.ADMIN,
    abilityRules: [] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
};

const accountMethods = {
    isAuthenticated: () => true,
    isRegisteredUser: () => true,
    isAnonymousUser: () => false,
    isSessionUser: () => true,
    isJwtUser: () => false,
    isServiceAccount: () => false,
    isPatUser: () => false,
    isOauthUser: () => false,
};

const manageOrganizationAbility = new Ability<PossibleAbilities>([
    { subject: 'Organization', action: ['manage'] },
]);

/** Org admin who can manage the organization — the happy-path account. */
export const mockAdminAccount = {
    authentication: { type: 'session' as const, source: 'test-session-cookie' },
    user: { ...baseUser, ability: manageOrganizationAbility },
    organization: {
        organizationUuid: ORG_UUID,
        name: 'Test Organization',
        createdAt: new Date('2024-01-01'),
    },
    ...accountMethods,
} as SessionAccount;

/** Member of the org with an empty ability — cannot manage SSO. */
export const mockAccountNoPermission = {
    ...mockAdminAccount,
    user: { ...baseUser, ability: new Ability<PossibleAbilities>([]) },
} as SessionAccount;

/** Authenticated user not attached to any organization. */
export const mockAccountNoOrg = {
    ...mockAdminAccount,
    organization: undefined,
} as unknown as SessionAccount;

export const azureAdMethod = (
    overrides: Partial<
        OrganizationSsoMethod<OrganizationSsoProvider.AZUREAD>
    > = {},
): OrganizationSsoMethod<OrganizationSsoProvider.AZUREAD> => ({
    organizationUuid: ORG_UUID,
    provider: OrganizationSsoProvider.AZUREAD,
    config: {
        oauth2ClientId: 'stored-client-id',
        oauth2ClientSecret: 'stored-secret',
        oauth2TenantId: 'stored-tenant-id',
    } satisfies AzureAdSsoConfig,
    enabled: true,
    overrideEmailDomains: false,
    emailDomains: [],
    allowPassword: true,
    ...overrides,
});

export const enabledMethodForOrg = (
    organizationUuid: string,
    provider: OrganizationSsoProvider = OrganizationSsoProvider.OKTA,
): OrganizationSsoMethod<OrganizationSsoProvider> =>
    ({
        organizationUuid,
        provider,
        config: {},
        enabled: true,
        overrideEmailDomains: false,
        emailDomains: [],
        allowPassword: true,
    }) as OrganizationSsoMethod<OrganizationSsoProvider>;
