import {
    CreateRole,
    defineUserAbility,
    ForbiddenError,
    getSystemRoles,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { GroupsModel } from '../../models/GroupsModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import { RolesService } from './RolesService';
import {
    mockAccount,
    mockAccountNoAccess,
    mockAnalytics,
    mockCustomRole,
    mockCustomRoleWithScopes,
    mockGroupsModel,
    mockNewRole,
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
        emailClient: {} as unknown as EmailClient,
    });
    beforeEach(() => {
        jest.clearAllMocks();
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
            jest.clearAllMocks();
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
});
