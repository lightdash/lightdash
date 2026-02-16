import { Ability } from '@casl/ability';
import {
    Account,
    LightdashUser,
    Organization,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    PossibleAbilities,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';

export const mockOrganizationUuid = 'org-uuid-123';
export const mockProjectUuid = 'project-uuid-456';
export const mockTargetUserUuid = 'target-user-uuid-789';

export const mockOrganization: Organization = {
    organizationUuid: mockOrganizationUuid,
    name: 'Test Organization',
    createdAt: new Date('2024-01-01'),
    needsProject: false,
    defaultProjectUuid: undefined,
    chartColors: [],
};

export const mockTargetUser: LightdashUser = {
    userUuid: mockTargetUserUuid,
    email: 'target@example.com',
    firstName: 'Target',
    lastName: 'User',
    userId: 1,
    organizationUuid: mockOrganizationUuid,
    organizationName: 'Test Organization',
    organizationCreatedAt: new Date('2024-01-01'),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

export const mockOrgAdmin1: OrganizationMemberProfile = {
    userUuid: 'admin-1-uuid',
    userCreatedAt: new Date('2024-01-01'),
    userUpdatedAt: new Date('2024-01-01'),
    email: 'admin1@example.com',
    firstName: 'Admin',
    lastName: 'One',
    organizationUuid: mockOrganizationUuid,
    role: OrganizationMemberRole.ADMIN,
    roleUuid: undefined,
    isActive: true,
    isInviteExpired: false,
};

export const mockOrgAdmin2: OrganizationMemberProfile = {
    userUuid: 'admin-2-uuid',
    userCreatedAt: new Date('2024-01-01'),
    userUpdatedAt: new Date('2024-01-01'),
    email: 'admin2@example.com',
    firstName: 'Admin',
    lastName: 'Two',
    organizationUuid: mockOrganizationUuid,
    role: OrganizationMemberRole.ADMIN,
    roleUuid: undefined,
    isActive: true,
    isInviteExpired: false,
};

export const mockProjectAdmin: ProjectMemberProfile = {
    userUuid: 'project-admin-uuid',
    projectUuid: mockProjectUuid,
    email: 'projectadmin@example.com',
    firstName: 'Project',
    lastName: 'Admin',
    role: ProjectMemberRole.ADMIN,
    roleUuid: undefined,
};

export const mockProjectSummary = {
    projectUuid: mockProjectUuid,
    name: 'Test Project',
    organizationUuid: mockOrganizationUuid,
    type: 'DEFAULT' as const,
    createdAt: new Date('2024-01-01'),
    pinnedListUuid: undefined,
    pinnedListOrder: undefined,
    description: 'Test project description',
    upstreamProjectUuid: undefined,
    parentProjectUuid: undefined,
};

const createMockAccount = (
    overrides: Partial<{
        userUuid: string;
        email: string;
        firstName: string;
        lastName: string;
        role: OrganizationMemberRole;
        isServiceAccount: boolean;
        serviceAccountDescription: string;
    }> = {},
): Account => {
    const isServiceAccount = overrides.isServiceAccount ?? false;

    return {
        organization: {
            organizationUuid: mockOrganizationUuid,
            name: 'Test Organization',
        },
        authentication: isServiceAccount
            ? {
                  type: 'service-account' as const,
                  source: 'mock-service-account-token',
                  description: overrides.serviceAccountDescription,
              }
            : { type: 'session' as const, source: 'mock-session-cookie' },
        user: {
            type: 'registered' as const,
            id: overrides.userUuid ?? 'changer-uuid',
            userUuid: overrides.userUuid ?? 'changer-uuid',
            email: overrides.email ?? 'changer@example.com',
            firstName: overrides.firstName ?? 'Changer',
            lastName: overrides.lastName ?? 'User',
            role: overrides.role ?? OrganizationMemberRole.ADMIN,
            organizationUuid: mockOrganizationUuid,
            organizationName: 'Test Organization',
            organizationCreatedAt: new Date('2024-01-01'),
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            isActive: true,
            ability: new Ability<PossibleAbilities>([]),
            abilityRules: [],
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        isAuthenticated: () => true,
        isRegisteredUser: () => true,
        isAnonymousUser: () => false,
        isSessionUser: () => !isServiceAccount,
        isJwtUser: () => false,
        isServiceAccount: () => isServiceAccount,
        isPatUser: () => false,
        isOauthUser: () => false,
    } as Account;
};

export const mockSessionAccount = createMockAccount();

export const mockServiceAccount = createMockAccount({
    isServiceAccount: true,
    serviceAccountDescription: 'Automated sync service',
});
