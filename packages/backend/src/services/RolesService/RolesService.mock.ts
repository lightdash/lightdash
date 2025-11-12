import {
    OrganizationMemberRole,
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
        ability: {
            can: jest.fn(() => true),
            cannot: jest.fn(() => false),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        abilityRules: [] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
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
        ability: {
            can: jest.fn(() => false),
            cannot: jest.fn(() => true),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
} as SessionAccount;

export const mockSystemRole: RoleWithScopes = {
    roleUuid: 'editor',
    name: 'editor',
    description: 'Can edit dashboards and charts',
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
    organizationUuid: 'test-org-uuid',
    ownerType: 'user',
    createdBy: 'test-user-uuid',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
};

export const mockRolesModel = {
    getRoleByUuid: jest.fn(),
    getRoleWithScopesByUuid: jest.fn(),
    createRole: jest.fn(),
    addScopesToRole: jest.fn(),
    getRolesByOrganizationUuid: jest.fn(),
    getRolesWithScopesByOrganizationUuid: jest.fn(),
    updateRole: jest.fn(),
    deleteRole: jest.fn(),
    removeScopeFromRole: jest.fn(),
    getOrganizationRoleAssignments: jest.fn(),
    upsertOrganizationUserRoleAssignment: jest.fn(),
    upsertSystemRoleProjectAccess: jest.fn(),
    upsertCustomRoleProjectAccess: jest.fn(),
    upsertSystemRoleGroupAccess: jest.fn(),
    upsertCustomRoleGroupAccess: jest.fn(),
    unassignCustomRoleFromUser: jest.fn(),
    assignRoleToGroup: jest.fn(),
    unassignRoleFromGroup: jest.fn(),
    getProjectAccess: jest.fn(),
    getGroupProjectAccess: jest.fn(),
    removeUserProjectAccess: jest.fn(),
    db: {
        transaction: jest.fn().mockImplementation(async (callback) =>
            // Mock transaction by just calling the callback with a mock transaction object
            callback({}),
        ),
    },
};

export const mockAnalytics = {
    track: jest.fn(),
};

export const mockUserModel = {
    getUserDetailsByUuid: jest.fn().mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
    }),
};

export const mockOrganizationModel = {
    get: jest.fn().mockResolvedValue({
        organizationUuid: 'test-org-uuid',
        name: 'Test Organization',
    }),
};

export const mockProjectModel = {
    getSummary: jest.fn().mockResolvedValue({
        projectUuid: 'test-project-uuid',
        organizationUuid: 'test-org-uuid',
    }),
    getAllByOrganizationUuid: jest.fn().mockResolvedValue([
        { projectUuid: 'proj-1', organizationUuid: 'test-org-uuid' },
        { projectUuid: 'proj-2', organizationUuid: 'test-org-uuid' },
    ]),
};

export const mockGroupsModel = {
    getGroup: jest.fn().mockResolvedValue({
        groupUuid: 'test-group-uuid',
        name: 'Test Group',
    }),
};
