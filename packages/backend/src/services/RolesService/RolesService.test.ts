import {
    CreateRole,
    CustomRoleAsCode,
    defineUserAbility,
    ForbiddenError,
    getSystemRoles,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    PromotionAction,
    UserAsCode,
    UserAsCodeInvitationStatus,
    UserAsCodeLifecycleStatus,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { GroupsModel } from '../../models/GroupsModel';
import { InviteLinkModel } from '../../models/InviteLinkModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import { RolesService } from './RolesService';
import {
    mockAccount,
    mockAccountNoAccess,
    mockAdminNotificationService,
    mockAnalytics,
    mockCustomRole,
    mockCustomRoleWithScopes,
    mockEmailClient,
    mockGroupsModel,
    mockInviteLinkModel,
    mockNewRole,
    mockOrganizationMemberProfileModel,
    mockOrganizationModel,
    mockProjectModel,
    mockRolesModel,
    mockUserModel,
} from './RolesService.mock';

describe('RolesService', () => {
    const service = new RolesService({
        lightdashConfig: {} as LightdashConfig,
        analytics: mockAnalytics as unknown as LightdashAnalytics,
        rolesModel: mockRolesModel as unknown as RolesModel,
        userModel: mockUserModel as unknown as UserModel,
        organizationModel:
            mockOrganizationModel as unknown as OrganizationModel,
        groupsModel: mockGroupsModel as unknown as GroupsModel,
        projectModel: mockProjectModel as unknown as ProjectModel,
        emailClient: mockEmailClient as unknown as EmailClient,
        adminNotificationService:
            mockAdminNotificationService as unknown as AdminNotificationService,
        inviteLinkModel: mockInviteLinkModel as unknown as InviteLinkModel,
        organizationMemberProfileModel:
            mockOrganizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
    });
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('custom roles as code', () => {
        const roleAsCode: CustomRoleAsCode = {
            version: 1,
            name: 'Custom Role',
            description: 'A custom role for testing',
            level: 'project',
            scopes: ['manage:Space', 'view:Dashboard'],
        };

        it('returns portable custom roles with sorted scopes', async () => {
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        scopes: ['view:Dashboard', 'manage:Space'],
                    },
                ],
            );

            await expect(
                service.getCustomRolesAsCode(mockAccount, 'test-org-uuid'),
            ).resolves.toStrictEqual([
                {
                    version: 1,
                    name: mockCustomRoleWithScopes.name,
                    description: mockCustomRoleWithScopes.description,
                    level: mockCustomRoleWithScopes.level,
                    scopes: ['manage:Space', 'view:Dashboard'],
                },
            ]);
            expect(
                mockRolesModel.getRolesWithScopesByOrganizationUuid,
            ).toHaveBeenCalledWith('test-org-uuid', 'user');
        });

        it('creates a missing custom role', async () => {
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [],
            );
            const createRole = vi
                .spyOn(service, 'createRole')
                .mockResolvedValue(mockNewRole);

            await expect(
                service.upsertCustomRoleAsCode(
                    mockAccount,
                    'test-org-uuid',
                    roleAsCode,
                ),
            ).resolves.toStrictEqual({ action: PromotionAction.CREATE });
            expect(createRole).toHaveBeenCalledWith(
                mockAccount,
                'test-org-uuid',
                {
                    name: roleAsCode.name,
                    description: roleAsCode.description,
                    level: roleAsCode.level,
                    scopes: roleAsCode.scopes,
                },
            );
            createRole.mockRestore();
        });

        it('updates scopes and clears the description', async () => {
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        scopes: ['manage:Space', 'view:Dashboard'],
                    },
                ],
            );
            const updateRole = vi
                .spyOn(service, 'updateRole')
                .mockResolvedValue(mockCustomRole);
            const desiredRole: CustomRoleAsCode = {
                ...roleAsCode,
                description: null,
                scopes: ['view:Dashboard', 'view:SavedChart'],
            };

            await expect(
                service.upsertCustomRoleAsCode(
                    mockAccount,
                    'test-org-uuid',
                    desiredRole,
                ),
            ).resolves.toStrictEqual({ action: PromotionAction.UPDATE });
            expect(updateRole).toHaveBeenCalledWith(
                mockAccount,
                'test-org-uuid',
                mockCustomRoleWithScopes.roleUuid,
                {
                    description: null,
                    scopes: {
                        add: ['view:SavedChart'],
                        remove: ['manage:Space'],
                    },
                },
            );
            updateRole.mockRestore();
        });

        it('returns no changes for an identical custom role', async () => {
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        scopes: roleAsCode.scopes,
                    },
                ],
            );

            await expect(
                service.upsertCustomRoleAsCode(
                    mockAccount,
                    'test-org-uuid',
                    roleAsCode,
                ),
            ).resolves.toStrictEqual({
                action: PromotionAction.NO_CHANGES,
            });
            expect(mockRolesModel.updateRole).not.toHaveBeenCalled();
        });

        it('preserves legacy level-incompatible scopes when unchanged', async () => {
            const legacyRole: CustomRoleAsCode = {
                ...roleAsCode,
                scopes: ['view:Dashboard', 'view:Organization'],
            };
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        scopes: legacyRole.scopes,
                    },
                ],
            );

            await expect(
                service.upsertCustomRoleAsCode(
                    mockAccount,
                    'test-org-uuid',
                    legacyRole,
                ),
            ).resolves.toStrictEqual({
                action: PromotionAction.NO_CHANGES,
            });
        });

        it('rejects newly added level-incompatible scopes', async () => {
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        scopes: ['view:Dashboard'],
                    },
                ],
            );

            await expect(
                service.upsertCustomRoleAsCode(mockAccount, 'test-org-uuid', {
                    ...roleAsCode,
                    scopes: ['view:Dashboard', 'view:Organization'],
                }),
            ).rejects.toThrow(
                'Scopes are not assignable at project level: view:Organization',
            );
        });

        it('rejects unknown scopes before reading existing roles', async () => {
            await expect(
                service.upsertCustomRoleAsCode(mockAccount, 'test-org-uuid', {
                    ...roleAsCode,
                    scopes: ['delete:VirtualViewsss'],
                }),
            ).rejects.toThrow(
                'Unknown custom role scopes: delete:VirtualViewsss',
            );
            expect(
                mockRolesModel.getRolesWithScopesByOrganizationUuid,
            ).not.toHaveBeenCalled();
        });

        it('rejects immutable level changes', async () => {
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        scopes: roleAsCode.scopes,
                    },
                ],
            );

            await expect(
                service.upsertCustomRoleAsCode(mockAccount, 'test-org-uuid', {
                    ...roleAsCode,
                    level: 'organization',
                }),
            ).rejects.toThrow(
                'Cannot change custom role "Custom Role" level from project to organization',
            );
        });
    });

    describe('users as code', () => {
        const userAsCode = (
            overrides: Partial<UserAsCode> = {},
        ): UserAsCode => ({
            version: 1,
            email: 'new-user@example.com',
            disabled: false,
            pending: false,
            role: {
                type: 'system',
                name: OrganizationMemberRole.MEMBER,
            },
            ...overrides,
        });

        const pendingUser = {
            userUuid: 'pending-user-uuid',
            email: 'new-user@example.com',
            organizationUuid: 'test-org-uuid',
            role: OrganizationMemberRole.MEMBER,
            roleUuid: undefined,
            isActive: true,
            isPending: true,
            firstName: '',
            lastName: '',
        };

        it('downloads users with portable roles and lifecycle flags', async () => {
            mockOrganizationMemberProfileModel.getAllOrganizationMembers.mockResolvedValue(
                [
                    {
                        ...pendingUser,
                        email: 'SYSTEM@EXAMPLE.COM',
                        isActive: false,
                    },
                    {
                        ...pendingUser,
                        userUuid: 'custom-user-uuid',
                        email: 'custom@example.com',
                        roleUuid: 'organization-custom-role-uuid',
                        isActive: true,
                        isPending: false,
                    },
                ],
            );
            mockRolesModel.getRolesWithScopesByOrganizationUuid.mockResolvedValue(
                [
                    {
                        ...mockCustomRoleWithScopes,
                        roleUuid: 'organization-custom-role-uuid',
                        name: 'Data steward',
                        level: 'organization',
                    },
                ],
            );

            await expect(
                service.getUsersAsCode(mockAccount, 'test-org-uuid'),
            ).resolves.toStrictEqual([
                {
                    version: 1,
                    email: 'system@example.com',
                    disabled: true,
                    pending: true,
                    role: {
                        type: 'system',
                        name: OrganizationMemberRole.MEMBER,
                    },
                },
                {
                    version: 1,
                    email: 'custom@example.com',
                    disabled: false,
                    pending: false,
                    role: { type: 'custom', name: 'Data steward' },
                },
            ]);
        });

        it('stages a missing user without sending an invitation by default', async () => {
            mockUserModel.findUserByEmail.mockResolvedValueOnce(undefined);
            mockUserModel.createPendingUser.mockResolvedValueOnce(pendingUser);
            mockUserModel.getUserDetailsByUuid
                .mockResolvedValueOnce(pendingUser)
                .mockResolvedValueOnce(pendingUser);

            await expect(
                service.upsertUserAsCode(
                    mockAccount,
                    'test-org-uuid',
                    userAsCode(),
                ),
            ).resolves.toStrictEqual({
                action: PromotionAction.CREATE,
                lifecycle: UserAsCodeLifecycleStatus.AWAITING_AUTHENTICATION,
                invitation: UserAsCodeInvitationStatus.NOT_REQUESTED,
            });
            expect(mockUserModel.createPendingUser).toHaveBeenCalledWith(
                'test-org-uuid',
                {
                    email: 'new-user@example.com',
                    firstName: '',
                    lastName: '',
                    role: OrganizationMemberRole.MEMBER,
                },
                true,
            );
            expect(mockEmailClient.sendInviteEmail).not.toHaveBeenCalled();
        });

        it('reconciles disabled and declared-pending flags', async () => {
            mockUserModel.findUserByEmail.mockResolvedValueOnce(pendingUser);
            mockUserModel.getUserDetailsByUuid.mockResolvedValueOnce({
                ...pendingUser,
                isActive: false,
            });

            await expect(
                service.upsertUserAsCode(
                    mockAccount,
                    'test-org-uuid',
                    userAsCode({ disabled: true, pending: true }),
                    true,
                ),
            ).resolves.toStrictEqual({
                action: PromotionAction.UPDATE,
                lifecycle: UserAsCodeLifecycleStatus.READY,
                invitation: UserAsCodeInvitationStatus.SKIPPED_DISABLED,
            });
            expect(mockUserModel.updateUser).toHaveBeenCalledWith(
                pendingUser.userUuid,
                pendingUser.email,
                { isActive: false },
            );
            expect(mockEmailClient.sendInviteEmail).not.toHaveBeenCalled();
        });

        it('sends an opt-in invitation to an eligible staged user', async () => {
            mockUserModel.findUserByEmail.mockResolvedValueOnce(pendingUser);
            mockUserModel.getUserDetailsByUuid
                .mockResolvedValueOnce(pendingUser)
                .mockResolvedValueOnce(pendingUser);
            mockInviteLinkModel.hasValidInviteLink.mockResolvedValueOnce(false);
            mockInviteLinkModel.upsert.mockResolvedValueOnce({
                inviteCode: 'invite-code',
                inviteUrl: 'https://lightdash.example/invite/invite-code',
                expiresAt: new Date('2026-01-01'),
                organizationUuid: 'test-org-uuid',
                userUuid: pendingUser.userUuid,
                email: pendingUser.email,
            });

            await expect(
                service.upsertUserAsCode(
                    mockAccount,
                    'test-org-uuid',
                    userAsCode({ pending: true }),
                    true,
                ),
            ).resolves.toStrictEqual({
                action: PromotionAction.NO_CHANGES,
                lifecycle: UserAsCodeLifecycleStatus.READY,
                invitation: UserAsCodeInvitationStatus.SENT,
            });
            expect(mockEmailClient.sendInviteEmail).toHaveBeenCalledOnce();
        });

        it('does not remove credentials to reproduce a pending state', async () => {
            mockUserModel.findUserByEmail.mockResolvedValueOnce({
                ...pendingUser,
                isPending: false,
            });

            await expect(
                service.upsertUserAsCode(
                    mockAccount,
                    'test-org-uuid',
                    userAsCode({ pending: true }),
                ),
            ).rejects.toThrow('upload never removes credentials');
        });

        it('refuses to disable or demote the last usable admin', async () => {
            const admin = {
                ...pendingUser,
                userUuid: 'admin-user-uuid',
                email: 'admin@example.com',
                role: OrganizationMemberRole.ADMIN,
                isPending: false,
            };
            mockUserModel.findUserByEmail.mockResolvedValueOnce(admin);
            mockOrganizationMemberProfileModel.getOrganizationAdmins.mockResolvedValueOnce(
                [admin],
            );

            await expect(
                service.upsertUserAsCode(
                    mockAccount,
                    'test-org-uuid',
                    userAsCode({
                        email: admin.email,
                        role: {
                            type: 'system',
                            name: OrganizationMemberRole.EDITOR,
                        },
                    }),
                ),
            ).rejects.toThrow(
                'Organization must have at least one enabled authenticated admin',
            );
        });

        it('requires organization-member permissions', async () => {
            await expect(
                service.getUsersAsCode(mockAccountNoAccess, 'test-org-uuid'),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('duplicateRole', () => {
        const organizationUuid = 'test-org-uuid';
        const newRoleName: CreateRole = {
            name: 'Duplicated Role',
            description: 'Duplicated Role Description',
        };

        describe('when duplicating a system role', () => {
            const systemRoleId = 'editor';

            beforeEach(() => {
                // Mock system role exists
                const systemRoles = getSystemRoles();
                const systemRole = systemRoles.find(
                    (r) => r.roleUuid === systemRoleId,
                );
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue(
                    systemRole,
                );
                mockRolesModel.createRole.mockResolvedValue(mockNewRole);
            });

            it('should duplicate a system role with a new name', async () => {
                const result = await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    systemRoleId,
                    newRoleName,
                );

                // Should create role with the new name
                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    {
                        name: newRoleName.name,
                        description: newRoleName.description,
                        level: 'project',
                        created_by: mockAccount.user?.id,
                    },
                    {}, // transaction object
                );

                // Should add scopes from the system role
                expect(mockRolesModel.addScopesToRole).toHaveBeenCalledWith(
                    mockNewRole.roleUuid,
                    expect.arrayContaining([
                        'view:Dashboard',
                        'view:Space',
                        'create:Space',
                    ]),
                    mockAccount.user?.id,
                    {}, // transaction object
                );

                // Should track analytics
                expect(mockAnalytics.track).toHaveBeenNthCalledWith(2, {
                    event: 'role.duplicated',
                    userId: mockAccount.user?.id,
                    properties: expect.objectContaining({
                        sourceRoleUuid: systemRoleId,
                        newRoleUuid: mockNewRole.roleUuid,
                        newRoleName: newRoleName.name,
                        isSourceSystemRole: true,
                        organizationUuid,
                    }),
                });

                expect(result.roleUuid).toBe(mockNewRole.roleUuid);
                expect(result.name).toBe(newRoleName.name);
            });

            it('should handle system role not found', async () => {
                const nonExistentRoleId = 'non-existent-system-role';
                // This is not a system role, so it will try to get it as a custom role
                mockRolesModel.getRoleWithScopesByUuid.mockRejectedValue(
                    new NotFoundError('Role not found'),
                );

                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        nonExistentRoleId,
                        newRoleName,
                    ),
                ).rejects.toThrow(NotFoundError);
            });
        });

        describe('when duplicating a custom role', () => {
            const customRoleId = 'custom-role-uuid';

            beforeEach(() => {
                mockRolesModel.getRoleByUuid.mockResolvedValue(mockCustomRole);
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue(
                    mockCustomRoleWithScopes,
                );
                mockRolesModel.createRole.mockResolvedValue(mockNewRole);
            });

            it('should duplicate a custom role with a new name', async () => {
                const result = await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    customRoleId,
                    newRoleName,
                );

                // Should validate role ownership
                expect(
                    mockRolesModel.getRoleWithScopesByUuid,
                ).toHaveBeenCalledWith(customRoleId);

                // Should create role with the new name
                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    {
                        name: newRoleName.name,
                        description: newRoleName.description,
                        level: 'project',
                        created_by: mockAccount.user?.id,
                    },
                    {}, // transaction object
                );

                // Should add scopes from the custom role
                expect(mockRolesModel.addScopesToRole).toHaveBeenCalledWith(
                    mockNewRole.roleUuid,
                    mockCustomRoleWithScopes.scopes,
                    mockAccount.user?.id,
                    {}, // transaction object
                );

                // Should track analytics
                expect(mockAnalytics.track).toHaveBeenNthCalledWith(2, {
                    event: 'role.duplicated',
                    userId: mockAccount.user?.id,
                    properties: expect.objectContaining({
                        sourceRoleUuid: customRoleId,
                        newRoleUuid: mockNewRole.roleUuid,
                        newRoleName: newRoleName.name,
                        isSourceSystemRole: false,
                        organizationUuid,
                    }),
                });

                expect(result.roleUuid).toBe(mockNewRole.roleUuid);
                expect(result.name).toBe(newRoleName.name);
                expect(result.scopes).toEqual(mockCustomRoleWithScopes.scopes);
            });

            it('should preserve the duplicated custom role level', async () => {
                const organizationRole = {
                    ...mockCustomRoleWithScopes,
                    level: 'organization' as const,
                };
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue(
                    organizationRole,
                );

                await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    customRoleId,
                    newRoleName,
                );

                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    expect.objectContaining({
                        level: 'organization',
                    }),
                    {},
                );
            });

            it('should forbid duplicating role from different organization', async () => {
                const roleFromDifferentOrg = {
                    ...mockCustomRoleWithScopes,
                    organizationUuid: 'different-org-uuid',
                };
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue(
                    roleFromDifferentOrg,
                );

                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        customRoleId,
                        newRoleName,
                    ),
                ).rejects.toThrow(ForbiddenError);
            });
        });

        describe('name validation', () => {
            const roleId = 'editor';

            beforeEach(() => {
                const systemRoles = getSystemRoles();
                const systemRole = systemRoles.find(
                    (r) => r.roleUuid === roleId,
                );
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue(
                    systemRole,
                );
                mockRolesModel.createRole.mockResolvedValue(mockNewRole);
            });

            it('should reject empty name', async () => {
                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        roleId,
                        { name: '' },
                    ),
                ).rejects.toThrow(ParameterError);
            });

            it('should reject name with only spaces', async () => {
                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        roleId,
                        { name: '   ' },
                    ),
                ).rejects.toThrow(ParameterError);
                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        roleId,
                        { name: '   ' },
                    ),
                ).rejects.toThrow('Role name cannot be empty');
            });

            it('should accept valid name', async () => {
                const validName = 'Valid Role Name 123';
                await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    roleId,
                    { name: validName },
                );

                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    expect.objectContaining({
                        name: validName,
                        level: 'project',
                    }),
                    {}, // transaction object
                );
            });
        });

        describe('authorization', () => {
            const roleId = 'editor';

            beforeEach(() => {
                const systemRoles = getSystemRoles();
                const systemRole = systemRoles.find(
                    (r) => r.roleUuid === roleId,
                );
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue(
                    systemRole,
                );
                mockRolesModel.createRole.mockResolvedValue(mockNewRole);
            });

            it('should forbid users from different organization', async () => {
                const accountDifferentOrg = {
                    ...mockAccount,
                    organization: {
                        ...mockAccount.organization!,
                        organizationUuid: 'different-org-uuid',
                    },
                };

                await expect(
                    service.duplicateRole(
                        accountDifferentOrg,
                        organizationUuid,
                        roleId,
                        newRoleName,
                    ),
                ).rejects.toThrow(ForbiddenError);
            });

            it('should forbid users without manage permission', async () => {
                await expect(
                    service.duplicateRole(
                        mockAccountNoAccess,
                        organizationUuid,
                        roleId,
                        newRoleName,
                    ),
                ).rejects.toThrow(ForbiddenError);
            });
        });
    });

    describe('getRolesByOrganizationUuid', () => {
        const organizationUuid = 'test-org-uuid';
        beforeEach(() => {
            vi.clearAllMocks();
            mockRolesModel.getRolesByOrganizationUuid.mockResolvedValue([]);
        });

        it('allows organization admins to view roles without fetching projects', async () => {
            // mockAccount by default can manage Organization
            await service.getRolesByOrganizationUuid(
                mockAccount,
                organizationUuid,
                false,
            );

            expect(
                mockProjectModel.getAllByOrganizationUuid,
            ).not.toHaveBeenCalled();
            expect(
                mockRolesModel.getRolesByOrganizationUuid,
            ).toHaveBeenCalledWith(organizationUuid, undefined);
        });

        it('allows users who can manage at least one project in the organization to view roles', async () => {
            const accountProjectManager = {
                ...mockAccount,
                user: {
                    ...mockAccount.user,
                    // Use defineUserAbility: cannot manage Organization (MEMBER), but can manage a specific Project (ADMIN on proj-2)
                    role: OrganizationMemberRole.MEMBER,
                    ability: defineUserAbility(
                        {
                            userUuid: mockAccount.user.userUuid,
                            role: OrganizationMemberRole.MEMBER,
                            organizationUuid,
                            roleUuid: undefined,
                        },
                        [
                            {
                                projectUuid: 'proj-2',
                                role: ProjectMemberRole.ADMIN,
                                userUuid: mockAccount.user.userUuid,
                                roleUuid: undefined,
                            },
                        ],
                    ),
                },
            };

            await service.getRolesByOrganizationUuid(
                accountProjectManager,
                organizationUuid,
                false,
            );

            expect(
                mockProjectModel.getAllByOrganizationUuid,
            ).toHaveBeenCalledWith(organizationUuid);
            expect(
                mockRolesModel.getRolesByOrganizationUuid,
            ).toHaveBeenCalledWith(organizationUuid, undefined);
        });

        it('throws ForbiddenError if user cannot manage organization nor any project within it', async () => {
            await expect(
                service.getRolesByOrganizationUuid(
                    mockAccountNoAccess,
                    organizationUuid,
                    false,
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(
                mockProjectModel.getAllByOrganizationUuid,
            ).toHaveBeenCalledWith(organizationUuid);
            expect(
                mockRolesModel.getRolesByOrganizationUuid,
            ).not.toHaveBeenCalled();
        });
    });

    describe('admin notification integration', () => {
        const organizationUuid = 'test-org-uuid';
        const userUuid = 'target-user-uuid';
        const projectUuid = 'test-project-uuid';

        beforeEach(() => {
            vi.clearAllMocks();
            mockUserModel.getUserDetailsByUuid.mockResolvedValue({
                userUuid,
                firstName: 'Target',
                lastName: 'User',
                role: OrganizationMemberRole.MEMBER,
            });
            mockRolesModel.getOrganizationAdmins.mockResolvedValue([
                'admin-uuid-1',
            ]);
            mockRolesModel.getProjectAccessByUserUuid.mockResolvedValue([]);
            mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue({
                roleUuid: OrganizationMemberRole.ADMIN,
                name: OrganizationMemberRole.ADMIN,
                scopes: [],
                ownerType: 'system',
            });
        });

        describe('upsertOrganizationUserRoleAssignment', () => {
            it('should call notifyOrgAdminRoleChange when assigning org role', async () => {
                await service.upsertOrganizationUserRoleAssignment(
                    mockAccount,
                    organizationUuid,
                    userUuid,
                    { roleId: OrganizationMemberRole.ADMIN },
                );

                expect(
                    mockAdminNotificationService.notifyOrgAdminRoleChange,
                ).toHaveBeenCalledWith(
                    mockAccount,
                    userUuid,
                    organizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );
            });

            it('should not throw if notification fails', async () => {
                mockAdminNotificationService.notifyOrgAdminRoleChange.mockRejectedValueOnce(
                    new Error('Notification failed'),
                );

                await expect(
                    service.upsertOrganizationUserRoleAssignment(
                        mockAccount,
                        organizationUuid,
                        userUuid,
                        { roleId: OrganizationMemberRole.ADMIN },
                    ),
                ).resolves.not.toThrow();
            });

            it('should assign an organization-level custom role to a user', async () => {
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue({
                    ...mockCustomRoleWithScopes,
                    level: 'organization',
                    scopes: ['manage:OrganizationDesign'],
                });

                const result =
                    await service.upsertOrganizationUserRoleAssignment(
                        mockAccount,
                        organizationUuid,
                        userUuid,
                        { roleId: mockCustomRoleWithScopes.roleUuid },
                    );

                expect(
                    mockRolesModel.upsertOrganizationUserRoleAssignment,
                ).toHaveBeenCalledWith(
                    organizationUuid,
                    userUuid,
                    mockCustomRoleWithScopes.roleUuid,
                );
                expect(result).toMatchObject({
                    roleId: mockCustomRoleWithScopes.roleUuid,
                    roleName: mockCustomRoleWithScopes.name,
                    ownerType: 'user',
                    assigneeType: 'user',
                });
                expect(
                    mockAdminNotificationService.notifyOrgAdminRoleChange,
                ).not.toHaveBeenCalled();
            });

            it('should reject project-level custom roles at organization level', async () => {
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue({
                    ...mockCustomRoleWithScopes,
                    level: 'project',
                    scopes: ['view:Dashboard'],
                });

                await expect(
                    service.upsertOrganizationUserRoleAssignment(
                        mockAccount,
                        organizationUuid,
                        userUuid,
                        { roleId: mockCustomRoleWithScopes.roleUuid },
                    ),
                ).rejects.toThrow(ParameterError);
            });

            it('should reject custom roles belonging to another organization', async () => {
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue({
                    ...mockCustomRoleWithScopes,
                    level: 'organization',
                    organizationUuid: 'another-org-uuid',
                    scopes: ['manage:OrganizationDesign'],
                });

                await expect(
                    service.upsertOrganizationUserRoleAssignment(
                        mockAccount,
                        organizationUuid,
                        userUuid,
                        { roleId: mockCustomRoleWithScopes.roleUuid },
                    ),
                ).rejects.toThrow(ForbiddenError);
            });
        });

        describe('upsertProjectUserRoleAssignment', () => {
            it('should call notifyProjectAdminRoleChange when assigning project role', async () => {
                await service.upsertProjectUserRoleAssignment(
                    mockAccount,
                    projectUuid,
                    userUuid,
                    { roleId: ProjectMemberRole.ADMIN },
                );

                expect(
                    mockAdminNotificationService.notifyProjectAdminRoleChange,
                ).toHaveBeenCalledWith({
                    account: mockAccount,
                    targetUserUuid: userUuid,
                    projectUuid,
                    organizationUuid,
                    previousRole: null,
                    newRole: ProjectMemberRole.ADMIN,
                });
            });

            it('should not throw if notification fails', async () => {
                mockAdminNotificationService.notifyProjectAdminRoleChange.mockRejectedValueOnce(
                    new Error('Notification failed'),
                );

                await expect(
                    service.upsertProjectUserRoleAssignment(
                        mockAccount,
                        projectUuid,
                        userUuid,
                        { roleId: ProjectMemberRole.ADMIN },
                    ),
                ).resolves.not.toThrow();
            });

            it('should reject organization-level custom roles at project level', async () => {
                mockRolesModel.getRoleWithScopesByUuid.mockResolvedValue({
                    ...mockCustomRoleWithScopes,
                    level: 'organization',
                    scopes: ['manage:OrganizationDesign'],
                });

                await expect(
                    service.upsertProjectUserRoleAssignment(
                        mockAccount,
                        projectUuid,
                        userUuid,
                        { roleId: mockCustomRoleWithScopes.roleUuid },
                    ),
                ).rejects.toThrow(ParameterError);
            });
        });
    });
});
