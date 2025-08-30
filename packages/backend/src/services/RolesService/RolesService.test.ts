import {
    ForbiddenError,
    getSystemRoles,
    NotFoundError,
    Organization,
    ParameterError,
    SessionAccount,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
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
    mockSystemRole,
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
    });
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('duplicateRole', () => {
        const organizationUuid = 'test-org-uuid';
        const newRoleName = 'Duplicated Role';

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
                        name: newRoleName,
                        description: expect.stringContaining('editor'),
                        created_by: mockAccount.user?.id,
                    },
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
                );

                // Should track analytics
                expect(mockAnalytics.track).toHaveBeenCalledWith({
                    event: 'role.duplicated',
                    userId: mockAccount.user?.id,
                    properties: expect.objectContaining({
                        sourceRoleUuid: systemRoleId,
                        newRoleUuid: mockNewRole.roleUuid,
                        newRoleName,
                        isSourceSystemRole: true,
                        organizationUuid,
                    }),
                });

                expect(result.roleUuid).toBe(mockNewRole.roleUuid);
                expect(result.name).toBe(newRoleName);
            });

            it('should duplicate a system role without providing a name', async () => {
                const result = await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    systemRoleId,
                );

                // Should create role with default name
                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    {
                        name: 'Copy of: editor',
                        description: expect.stringContaining('editor'),
                        created_by: mockAccount.user?.id,
                    },
                );

                expect(result.roleUuid).toBe(mockNewRole.roleUuid);
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
                        name: newRoleName,
                        description: 'Custom Role',
                        created_by: mockAccount.user?.id,
                    },
                );

                // Should add scopes from the custom role
                expect(mockRolesModel.addScopesToRole).toHaveBeenCalledWith(
                    mockNewRole.roleUuid,
                    mockCustomRoleWithScopes.scopes,
                    mockAccount.user?.id,
                );

                // Should track analytics
                expect(mockAnalytics.track).toHaveBeenCalledWith({
                    event: 'role.duplicated',
                    userId: mockAccount.user?.id,
                    properties: expect.objectContaining({
                        sourceRoleUuid: customRoleId,
                        newRoleUuid: mockNewRole.roleUuid,
                        newRoleName,
                        isSourceSystemRole: false,
                        organizationUuid,
                    }),
                });

                expect(result.roleUuid).toBe(mockNewRole.roleUuid);
                expect(result.name).toBe(newRoleName);
                expect(result.scopes).toEqual(mockCustomRoleWithScopes.scopes);
            });

            it('should duplicate a custom role without providing a name', async () => {
                const result = await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    customRoleId,
                );

                // Should create role with default name
                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    {
                        name: 'Copy of: Custom Role',
                        description: 'Custom Role',
                        created_by: mockAccount.user?.id,
                    },
                );

                expect(result.roleUuid).toBe(mockNewRole.roleUuid);
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
                        '',
                    ),
                ).rejects.toThrow(ParameterError);
            });

            it('should reject name with only spaces', async () => {
                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        roleId,
                        '   ',
                    ),
                ).rejects.toThrow(ParameterError);
                await expect(
                    service.duplicateRole(
                        mockAccount,
                        organizationUuid,
                        roleId,
                        '   ',
                    ),
                ).rejects.toThrow('Role name cannot be empty');
            });

            it('should accept valid name', async () => {
                const validName = 'Valid Role Name 123';
                await service.duplicateRole(
                    mockAccount,
                    organizationUuid,
                    roleId,
                    validName,
                );

                expect(mockRolesModel.createRole).toHaveBeenCalledWith(
                    organizationUuid,
                    expect.objectContaining({
                        name: validName,
                    }),
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
});
