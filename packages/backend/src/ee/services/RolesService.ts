import { subject } from '@casl/ability';
import {
    Account,
    AddScopesToRole,
    CreateGroupRoleAssignmentRequest,
    CreateRole,
    CreateRoleAssignmentRequest,
    CreateUserRoleAssignmentRequest,
    ForbiddenError,
    ParameterError,
    Role,
    RoleAssignment,
    RoleWithScopes,
    UpdateRole,
    UpdateRoleAssignmentRequest,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { GroupsModel } from '../../models/GroupsModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../../services/BaseService';

type RolesServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    rolesModel: RolesModel;
    userModel: UserModel;
    organizationModel: OrganizationModel;
    groupsModel: GroupsModel;
    projectModel: ProjectModel;
};

export class RolesService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly rolesModel: RolesModel;

    private readonly userModel: UserModel;

    private readonly organizationModel: OrganizationModel;

    private readonly groupsModel: GroupsModel;

    private readonly projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        analytics,
        rolesModel,
        userModel,
        organizationModel,
        groupsModel,
        projectModel,
    }: RolesServiceArguments) {
        super({ serviceName: 'RolesService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.rolesModel = rolesModel;
        this.userModel = userModel;
        this.organizationModel = organizationModel;
        this.groupsModel = groupsModel;
        this.projectModel = projectModel;
    }

    private static validateOrganizationAccess(
        account: Account,
        organizationUuid?: string,
    ): void {
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        if (account.organization?.organizationUuid !== organizationUuid) {
            throw new ForbiddenError();
        }

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private static validateRoleOwnership(account: Account, role: Role): void {
        if (account.organization?.organizationUuid !== role.organizationUuid) {
            throw new ForbiddenError();
        }

        if (
            account.user.ability.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: role.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async validateProjectAccess(
        account: Account,
        projectUuid?: string,
    ) {
        if (projectUuid) {
            const project = await this.projectModel.getSummary(projectUuid);
            if (
                account.user.ability.cannot(
                    'manage',
                    subject('Project', {
                        organizationUuid: project.organizationUuid,
                        projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }
    }

    private static validateRoleName(name: string): void {
        if (!name) {
            throw new ParameterError('Role name is required');
        }
        if (name.trim().length === 0) {
            throw new ParameterError('Role name cannot be empty');
        }
        if (name.length > 255) {
            throw new ParameterError(
                'Role name must be 255 characters or less',
            );
        }
    }

    async getRolesByOrganizationUuid(
        account: Account,
        organizationUuid: string,
        loadScopes?: boolean,
    ): Promise<Role[] | RoleWithScopes[]> {
        RolesService.validateOrganizationAccess(account, organizationUuid);

        if (loadScopes) {
            return this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
            );
        }

        return this.rolesModel.getRolesByOrganizationUuid(organizationUuid);
    }

    async createRole(
        account: Account,
        organizationUuid: string,
        createRoleData: CreateRole,
    ): Promise<Role> {
        RolesService.validateOrganizationAccess(account, organizationUuid);
        RolesService.validateRoleName(createRoleData.name);

        const role = await this.rolesModel.createRole(organizationUuid, {
            name: createRoleData.name,
            description: createRoleData.description || null,
            created_by: account.user?.id,
        });

        this.analytics.track({
            event: 'role.created',
            userId: account.user?.id,
            properties: {
                roleUuid: role.roleUuid,
                roleName: role.name,
                organizationUuid,
            },
        });

        return role;
    }

    async updateRole(
        account: Account,
        roleUuid: string,
        updateRoleData: UpdateRole,
    ): Promise<Role> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);

        if (updateRoleData.name) {
            RolesService.validateRoleName(updateRoleData.name);
        }

        const updatedRole = await this.rolesModel.updateRole(
            roleUuid,
            updateRoleData,
        );

        this.analytics.track({
            event: 'role.updated',
            userId: account.user?.id,
            properties: {
                roleUuid: updatedRole.roleUuid,
                roleName: updatedRole.name,
                organizationUuid: role.organizationUuid,
            },
        });

        return updatedRole;
    }

    async getRoleByUuid(
        account: Account,
        roleUuid: string,
    ): Promise<RoleWithScopes> {
        const role = await this.rolesModel.getRoleWithScopesByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);

        return role;
    }

    // =====================================
    // UNIFIED ORGANIZATION ROLE ASSIGNMENTS
    // =====================================

    async getOrganizationRoleAssignments(
        account: Account,
        orgUuid: string,
    ): Promise<RoleAssignment[]> {
        RolesService.validateOrganizationAccess(account, orgUuid);

        // Get organization role assignments from model
        const userAssignments =
            await this.rolesModel.getOrganizationRoleAssignments(orgUuid);

        // Format user assignments
        const formattedUserAssignments: RoleAssignment[] = userAssignments.map(
            (assignment) => ({
                roleId: assignment.roleId,
                roleName: assignment.roleName || 'Unknown Role',
                assigneeType: 'user' as const,
                assigneeId: assignment.assigneeId,
                assigneeName: assignment.assigneeName,
                organizationId: assignment.organizationId,
                createdAt: assignment.createdAt,
                updatedAt: assignment.createdAt, // Use createdAt since updatedAt doesn't exist
            }),
        );

        // Note: Groups don't have organization-level role assignments
        // Groups only have project-level and space-level access

        return formattedUserAssignments;
    }

    async createOrganizationRoleAssignment(
        account: Account,
        orgUuid: string,
        request: CreateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId, assigneeType, assigneeId } = request;

        // Validate role ownership and get role details
        const role = await this.rolesModel.getRoleByUuid(roleId);
        RolesService.validateRoleOwnership(account, role);

        if (assigneeType === 'user') {
            await this.assignRoleToUser(account, assigneeId, roleId, orgUuid);

            // Get user details for response
            const user = await this.userModel.getUserDetailsByUuid(assigneeId);

            return {
                roleId,
                roleName: role.name,
                assigneeType: 'user',
                assigneeId,
                assigneeName: `${user.firstName} ${user.lastName}`,
                organizationId: orgUuid,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }
        if (assigneeType === 'group') {
            // Organization-level group role assignments are not supported
            // Groups only have project-level and space-level access
            throw new ParameterError(
                'Organization-level group role assignments are not supported',
            );
        } else {
            throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
        }
    }

    async deleteOrganizationRoleAssignment(
        account: Account,
        orgUuid: string,
        assigneeId: string,
        assigneeType: 'user' | 'group',
    ): Promise<void> {
        if (assigneeType === 'user') {
            await this.unassignRoleFromUser(account, assigneeId, orgUuid);
        } else if (assigneeType === 'group') {
            // Organization-level group role assignments are not supported
            // Groups only have project-level and space-level access
            throw new ParameterError(
                'Organization-level group role assignments are not supported',
            );
        } else {
            throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
        }
    }

    // =====================================
    // SEPARATE ORGANIZATION ROLE ASSIGNMENTS
    // =====================================

    async createOrganizationUserRoleAssignment(
        account: Account,
        orgUuid: string,
        userId: string,
        request: CreateUserRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId } = request;

        // Validate role ownership and get role details
        const role = await this.rolesModel.getRoleByUuid(roleId);
        RolesService.validateRoleOwnership(account, role);

        await this.assignRoleToUser(account, userId, roleId, orgUuid);

        // Get user details for response
        const user = await this.userModel.getUserDetailsByUuid(userId);

        return {
            roleId,
            roleName: role.name,
            assigneeType: 'user',
            assigneeId: userId,
            assigneeName: `${user.firstName} ${user.lastName}`,
            organizationId: orgUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    // eslint-disable-next-line class-methods-use-this
    async createOrganizationGroupRoleAssignment(
        account: Account,
        orgUuid: string,
        groupId: string,
        request: CreateGroupRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        // Organization-level group role assignments are not supported
        // Groups only have project-level and space-level access
        throw new ParameterError(
            'Organization-level group role assignments are not supported',
        );
    }

    // =====================================
    // UNIFIED PROJECT ROLE ASSIGNMENTS
    // =====================================

    async getProjectRoleAssignments(
        account: Account,
        projectId: string,
    ): Promise<RoleAssignment[]> {
        await this.validateProjectAccess(account, projectId);

        // Get existing project access data
        const projectAccess = await this.getProjectAccess(account, projectId);

        const assignments: RoleAssignment[] = [];

        // Convert user access to unified format
        for (const userAccess of projectAccess.users) {
            assignments.push({
                roleId: userAccess.role, // This might be role name for legacy, need to handle
                roleName: userAccess.role,
                assigneeType: 'user',
                assigneeId: userAccess.userUuid,
                assigneeName: `${userAccess.firstName} ${userAccess.lastName}`,
                projectId: userAccess.projectUuid,
                createdAt: new Date(), // TODO: Get actual dates from DB
                updatedAt: new Date(),
            });
        }

        // Convert group access to unified format
        for (const groupAccess of projectAccess.groups) {
            assignments.push({
                roleId: groupAccess.role, // This might be role name for legacy
                roleName: groupAccess.role,
                assigneeType: 'group',
                assigneeId: groupAccess.groupUuid,
                assigneeName: groupAccess.groupName,
                projectId: groupAccess.projectUuid,
                createdAt: new Date(), // TODO: Get actual dates from DB
                updatedAt: new Date(),
            });
        }

        return assignments;
    }

    async createProjectRoleAssignment(
        account: Account,
        projectId: string,
        request: CreateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId, assigneeType, assigneeId } = request;

        // Validate role ownership and get role details
        const role = await this.rolesModel.getRoleByUuid(roleId);
        RolesService.validateRoleOwnership(account, role);

        if (assigneeType === 'user') {
            await this.createUserProjectAccess(
                account,
                projectId,
                assigneeId,
                roleId,
            );

            // Get user details for response
            const user = await this.userModel.getUserDetailsByUuid(assigneeId);

            return {
                roleId,
                roleName: role.name,
                assigneeType: 'user',
                assigneeId,
                assigneeName: `${user.firstName} ${user.lastName}`,
                projectId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }
        if (assigneeType === 'group') {
            await this.assignRoleToGroup(
                account,
                assigneeId,
                roleId,
                projectId,
            );

            // Get group details for response
            const group = await this.groupsModel.getGroup(assigneeId);

            return {
                roleId,
                roleName: role.name,
                assigneeType: 'group',
                assigneeId,
                assigneeName: group.name,
                projectId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }
        throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
    }

    async updateProjectRoleAssignment(
        account: Account,
        projectId: string,
        assigneeId: string,
        assigneeType: 'user' | 'group',
        request: UpdateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId } = request;

        // Validate role ownership and get role details
        const role = await this.rolesModel.getRoleByUuid(roleId);
        RolesService.validateRoleOwnership(account, role);

        if (assigneeType === 'user') {
            await this.updateUserProjectAccess(
                account,
                projectId,
                assigneeId,
                roleId,
            );

            // Get user details for response
            const user = await this.userModel.getUserDetailsByUuid(assigneeId);

            return {
                roleId,
                roleName: role.name,
                assigneeType: 'user',
                assigneeId,
                assigneeName: `${user.firstName} ${user.lastName}`,
                projectId,
                createdAt: new Date(), // TODO: Get actual dates from DB
                updatedAt: new Date(),
            };
        }
        if (assigneeType === 'group') {
            await this.assignRoleToGroup(
                account,
                assigneeId,
                roleId,
                projectId,
            );

            // Get group details for response
            const group = await this.groupsModel.getGroup(assigneeId);

            return {
                roleId,
                roleName: role.name,
                assigneeType: 'group',
                assigneeId,
                assigneeName: group.name,
                projectId,
                createdAt: new Date(), // TODO: Get actual dates from DB
                updatedAt: new Date(),
            };
        }
        throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
    }

    async deleteProjectRoleAssignment(
        account: Account,
        projectId: string,
        assigneeId: string,
        assigneeType: 'user' | 'group',
    ): Promise<void> {
        if (assigneeType === 'user') {
            await this.removeUserProjectAccess(account, projectId, assigneeId);
        } else if (assigneeType === 'group') {
            await this.unassignRoleFromGroup(account, assigneeId, projectId);
        } else {
            throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
        }
    }

    // =====================================
    // SEPARATE PROJECT ROLE ASSIGNMENTS
    // =====================================

    async createProjectUserRoleAssignment(
        account: Account,
        projectId: string,
        userId: string,
        request: CreateUserRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId } = request;

        // Validate role ownership and get role details
        const role = await this.rolesModel.getRoleByUuid(roleId);
        RolesService.validateRoleOwnership(account, role);

        await this.createUserProjectAccess(account, projectId, userId, roleId);

        // Get user details for response
        const user = await this.userModel.getUserDetailsByUuid(userId);

        return {
            roleId,
            roleName: role.name,
            assigneeType: 'user',
            assigneeId: userId,
            assigneeName: `${user.firstName} ${user.lastName}`,
            projectId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async createProjectGroupRoleAssignment(
        account: Account,
        projectId: string,
        groupId: string,
        request: CreateGroupRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId } = request;

        // Validate role ownership and get role details
        const role = await this.rolesModel.getRoleByUuid(roleId);
        RolesService.validateRoleOwnership(account, role);

        await this.assignRoleToGroup(account, groupId, roleId, projectId);

        // Get group details for response
        const group = await this.groupsModel.getGroup(groupId);

        return {
            roleId,
            roleName: role.name,
            assigneeType: 'group',
            assigneeId: groupId,
            assigneeName: group.name,
            projectId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async deleteRole(account: Account, roleUuid: string): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);

        await this.rolesModel.deleteRole(roleUuid);

        this.analytics.track({
            event: 'role.deleted',
            userId: account.user?.id,
            properties: {
                roleUuid,
                roleName: role.name,
                organizationUuid: role.organizationUuid,
            },
        });
    }

    async assignRoleToUser(
        account: Account,
        userUuid: string,
        roleUuid: string,
        organizationUuid?: string,
        projectUuid?: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.assignRoleToUser(
            userUuid,
            roleUuid,
            organizationUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.assigned_to_user',
            userId: account.user?.id,
            properties: {
                roleUuid,
                targetUserUuid: userUuid,
                organizationUuid: role.organizationUuid,
                projectUuid,
            },
        });
    }

    async unassignRoleFromUser(
        account: Account,
        userUuid: string,
        organizationUuid?: string,
        projectUuid?: string,
    ): Promise<void> {
        RolesService.validateOrganizationAccess(account, organizationUuid);
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.unassignRoleFromUser(
            userUuid,
            organizationUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.unassigned_from_user',
            userId: account.user?.id,
            properties: {
                targetUserUuid: userUuid,
                organizationUuid,
                projectUuid,
            },
        });
    }

    async assignRoleToGroup(
        account: Account,
        groupUuid: string,
        roleUuid: string,
        projectUuid?: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.assignRoleToGroup(
            groupUuid,
            roleUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.assigned_to_group',
            userId: account.user?.id,
            properties: {
                roleUuid,
                groupUuid,
                organizationUuid: role.organizationUuid,
                projectUuid,
            },
        });
    }

    async unassignRoleFromGroup(
        account: Account,
        groupUuid: string,
        projectUuid?: string,
    ): Promise<void> {
        RolesService.validateOrganizationAccess(
            account,
            account.organization?.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.unassignRoleFromGroup(groupUuid, projectUuid);

        this.analytics.track({
            event: 'role.unassigned_from_group',
            userId: account.user?.id,
            properties: {
                groupUuid,
                projectUuid,
            },
        });
    }

    async getProjectAccess(account: Account, projectUuid: string) {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(
            account,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        const userAccess = await this.rolesModel.getProjectAccess(projectUuid);

        const groupAccess = await this.rolesModel.getGroupProjectAccess(
            projectUuid,
        );

        return {
            users: userAccess,
            groups: groupAccess,
        };
    }

    async createUserProjectAccess(
        account: Account,
        projectUuid: string,
        userUuid: string,
        roleUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(
            account,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.createUserProjectAccess(
            projectUuid,
            userUuid,
            roleUuid,
        );

        this.analytics.track({
            event: 'project_access.created',
            userId: account.user?.id,
            properties: {
                projectUuid,
                targetUserUuid: userUuid,
                roleUuid,
            },
        });
    }

    async updateUserProjectAccess(
        account: Account,
        projectUuid: string,
        userUuid: string,
        roleUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(
            account,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.updateUserProjectAccess(userUuid, roleUuid);

        this.analytics.track({
            event: 'project_access.updated',
            userId: account.user?.id,
            properties: {
                projectUuid,
                userUuid,
                roleUuid,
            },
        });
    }

    async removeUserProjectAccess(
        account: Account,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(
            account,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.removeUserProjectAccess(userUuid);

        this.analytics.track({
            event: 'project_access.removed',
            userId: account.user?.id,
            properties: {
                projectUuid,
                userUuid,
            },
        });
    }

    async addScopesToRole(
        account: Account,
        roleUuid: string,
        scopeData: AddScopesToRole,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);

        await this.rolesModel.addScopesToRole(
            roleUuid,
            scopeData.scopeNames,
            account.user?.id,
        );

        this.analytics.track({
            event: 'role.scopes_added',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeNames: scopeData.scopeNames,
                organizationUuid: role.organizationUuid,
            },
        });
    }

    async removeScopeFromRole(
        account: Account,
        roleUuid: string,
        scopeName: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);

        await this.rolesModel.removeScopeFromRole(roleUuid, scopeName);

        this.analytics.track({
            event: 'role.scope_removed',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeName,
                organizationUuid: role.organizationUuid,
            },
        });
    }
}
