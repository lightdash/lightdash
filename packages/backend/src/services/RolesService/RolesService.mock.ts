import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    PossibleAbilities,
    Role,
    RoleWithScopes,
    SessionAccount,
} from '@lightdash/common';

export const mockAccount = {
    authentication: {
        type: 'session' as const,
        source: 'test-session-cookie',
    },
    user: {
        type: 'registered' as const,
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        userUuid: 'test-user-uuid',
        isActive: true,
        role: OrganizationMemberRole.ADMIN,
        ability: new Ability<PossibleAbilities>([
            { subject: 'Organization', action: ['manage'] },
            { subject: 'Project', action: ['manage'] },
        ]),
        abilityRules: [] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        timezone: null,
        isSetupComplete: true,
        userId: 1,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
    },
    organization: {
        organizationUuid: 'test-org-uuid',
        name: 'Test Organization',
        createdAt: new Date('2024-01-01'),
    },
    isAuthenticated: () => true,
    isRegisteredUser: () => true,
    isAnonymousUser: () => false,
    isSessionUser: () => true,
    isJwtUser: () => false,
    isServiceAccount: () => false,
    isPatUser: () => false,
    isOauthUser: () => false,
} as SessionAccount;

export const mockAccountNoAccess = {
    ...mockAccount,
    user: {
        ...mockAccount.user,
        ability: new Ability<PossibleAbilities>([]),
    },
} as SessionAccount;

export const mockSystemRole: RoleWithScopes = {
    roleUuid: 'editor',
    name: 'editor',
    description: 'Can edit dashboards and charts',
    level: 'project',
    organizationUuid: null,
    ownerType: 'system',
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    scopes: [
        'view:Dashboard',
        'view:Space',
        'create:Space',
        'manage:Job',
        'manage:PinnedItems',
    ],
};

export const mockCustomRole: Role = {
    roleUuid: 'custom-role-uuid',
    name: 'Custom Role',
    description: 'A custom role for testing',
    level: 'project',
    organizationUuid: 'test-org-uuid',
    ownerType: 'user',
    createdBy: 'test-user-uuid',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
};

export const mockCustomRoleWithScopes: RoleWithScopes = {
    ...mockCustomRole,
    scopes: ['view_project', 'view_dashboard', 'manage:Space'],
};

export const mockNewRole: Role = {
    roleUuid: 'new-role-uuid',
    name: 'Duplicated Role',
    description: null,
    level: 'project',
    organizationUuid: 'test-org-uuid',
    ownerType: 'user',
    createdBy: 'test-user-uuid',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
};

export const mockRolesModel: Record<string, any> = {
    getRoleByUuid: vi.fn(),
    getRoleWithScopesByUuid: vi.fn(),
    createRole: vi.fn(),
    addScopesToRole: vi.fn(),
    getRolesByOrganizationUuid: vi.fn(),
    getRolesWithScopesByOrganizationUuid: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    removeScopeFromRole: vi.fn(),
    getOrganizationRoleAssignments: vi.fn(),
    getOrganizationAdmins: vi.fn(),
    upsertOrganizationUserRoleAssignment: vi.fn(),
    upsertSystemRoleProjectAccess: vi.fn(),
    upsertCustomRoleProjectAccess: vi.fn(),
    upsertSystemRoleGroupAccess: vi.fn(),
    upsertCustomRoleGroupAccess: vi.fn(),
    unassignCustomRoleFromUser: vi.fn(),
    assignRoleToGroup: vi.fn(),
    unassignRoleFromGroup: vi.fn(),
    getProjectAccess: vi.fn(),
    getProjectAccessByUserUuid: vi.fn(),
    getGroupProjectAccess: vi.fn(),
    removeUserProjectAccess: vi.fn(),
    db: {
        transaction: vi
            .fn()
            .mockImplementation(
                async (
                    callback: (trx: unknown) => unknown | Promise<unknown>,
                ) =>
                    // Mock transaction by just calling the callback with a mock transaction object
                    callback({}),
            ),
    },
};

export const mockAnalytics: Record<string, any> = {
    track: vi.fn(),
};

export const mockUserModel: Record<string, any> = {
    getUserDetailsByUuid: vi.fn().mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
    }),
};

export const mockOrganizationModel: Record<string, any> = {
    get: vi.fn().mockResolvedValue({
        organizationUuid: 'test-org-uuid',
        name: 'Test Organization',
    }),
};

export const mockProjectModel: Record<string, any> = {
    getSummary: vi.fn().mockResolvedValue({
        projectUuid: 'test-project-uuid',
        organizationUuid: 'test-org-uuid',
    }),
    getAllByOrganizationUuid: vi.fn().mockResolvedValue([
        { projectUuid: 'proj-1', organizationUuid: 'test-org-uuid' },
        { projectUuid: 'proj-2', organizationUuid: 'test-org-uuid' },
    ]),
};

export const mockGroupsModel: Record<string, any> = {
    getGroup: vi.fn().mockResolvedValue({
        groupUuid: 'test-group-uuid',
        name: 'Test Group',
    }),
};

export const mockAdminNotificationService: Record<string, any> = {
    notifyOrgAdminRoleChange: vi.fn().mockResolvedValue(undefined),
    notifyProjectAdminRoleChange: vi.fn().mockResolvedValue(undefined),
};
