import {
    AddScopesToRole,
    CreateRole,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    Role,
    RoleWithScopes,
    SessionUser,
    UpdateRole,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import { GroupsModel } from '../models/GroupsModel';
import { OrganizationModel } from '../models/OrganizationModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { RolesModel } from '../models/RolesModel';
import { UserModel } from '../models/UserModel';
import { BaseService } from './BaseService';

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
        user: SessionUser,
        organizationUuid: string,
    ): void {
        if (
            !user.organizationUuid ||
            user.organizationUuid !== organizationUuid
        ) {
            throw new ForbiddenError();
        }
    }

    private static validateRoleOwnership(user: SessionUser, role: Role): void {
        if (
            !user.organizationUuid ||
            user.organizationUuid !== role.organizationUuid
        ) {
            throw new ForbiddenError();
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
        user: SessionUser,
        organizationUuid: string,
        loadScopes?: boolean,
    ): Promise<Role[] | RoleWithScopes[]> {
        RolesService.validateOrganizationAccess(user, organizationUuid);

        if (loadScopes) {
            return this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
            );
        }

        return this.rolesModel.getRolesByOrganizationUuid(organizationUuid);
    }

    async createRole(
        user: SessionUser,
        organizationUuid: string,
        createRoleData: CreateRole,
    ): Promise<Role> {
        RolesService.validateOrganizationAccess(user, organizationUuid);
        RolesService.validateRoleName(createRoleData.name);

        const role = await this.rolesModel.createRole(
            organizationUuid,
            {
                name: createRoleData.name,
                description: createRoleData.description || null,
                created_by: user.userUuid,
            },
            user,
        );

        this.analytics.track({
            event: 'role.created',
            userId: user.userUuid,
            properties: {
                roleUuid: role.roleUuid,
                roleName: role.name,
                organizationUuid,
            },
        });

        return role;
    }

    async updateRole(
        user: SessionUser,
        roleUuid: string,
        updateRoleData: UpdateRole,
    ): Promise<Role> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(user, role);

        if (updateRoleData.name) {
            RolesService.validateRoleName(updateRoleData.name);
        }

        const updatedRole = await this.rolesModel.updateRole(
            roleUuid,
            updateRoleData,
        );

        this.analytics.track({
            event: 'role.updated',
            userId: user.userUuid,
            properties: {
                roleUuid: updatedRole.roleUuid,
                roleName: updatedRole.name,
                organizationUuid: role.organizationUuid,
            },
        });

        return updatedRole;
    }

    async deleteRole(user: SessionUser, roleUuid: string): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(user, role);

        await this.rolesModel.deleteRole(roleUuid);

        this.analytics.track({
            event: 'role.deleted',
            userId: user.userUuid,
            properties: {
                roleUuid,
                roleName: role.name,
                organizationUuid: role.organizationUuid,
            },
        });
    }

    async assignRoleToUser(
        user: SessionUser,
        userUuid: string,
        roleUuid: string,
        organizationUuid?: string,
        projectUuid?: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(user, role);

        await this.rolesModel.assignRoleToUser(
            userUuid,
            roleUuid,
            organizationUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.assigned_to_user',
            userId: user.userUuid,
            properties: {
                roleUuid,
                targetUserUuid: userUuid,
                organizationUuid: role.organizationUuid,
                projectUuid,
            },
        });
    }

    async unassignRoleFromUser(
        user: SessionUser,
        userUuid: string,
        organizationUuid?: string,
        projectUuid?: string,
    ): Promise<void> {
        if (organizationUuid) {
            RolesService.validateOrganizationAccess(user, organizationUuid);
        } else if (!user.organizationUuid) {
            throw new ForbiddenError();
        }

        await this.rolesModel.unassignRoleFromUser(
            userUuid,
            organizationUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.unassigned_from_user',
            userId: user.userUuid,
            properties: {
                targetUserUuid: userUuid,
                organizationUuid,
                projectUuid,
            },
        });
    }

    async assignRoleToGroup(
        user: SessionUser,
        groupUuid: string,
        roleUuid: string,
        projectUuid?: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(user, role);

        await this.rolesModel.assignRoleToGroup(
            groupUuid,
            roleUuid,
            projectUuid,
        );

        this.analytics.track({
            event: 'role.assigned_to_group',
            userId: user.userUuid,
            properties: {
                roleUuid,
                groupUuid,
                organizationUuid: role.organizationUuid,
                projectUuid,
            },
        });
    }

    async unassignRoleFromGroup(
        user: SessionUser,
        groupUuid: string,
        projectUuid?: string,
    ): Promise<void> {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }

        await this.rolesModel.unassignRoleFromGroup(groupUuid, projectUuid);

        this.analytics.track({
            event: 'role.unassigned_from_group',
            userId: user.userUuid,
            properties: {
                groupUuid,
                projectUuid,
            },
        });
    }

    async getProjectAccess(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(user, project.organizationUuid);

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
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
        roleUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(user, project.organizationUuid);

        await this.rolesModel.createUserProjectAccess(
            projectUuid,
            userUuid,
            roleUuid,
        );

        this.analytics.track({
            event: 'project_access.created',
            userId: user.userUuid,
            properties: {
                projectUuid,
                targetUserUuid: userUuid,
                roleUuid,
            },
        });
    }

    async updateUserProjectAccess(
        user: SessionUser,
        projectUuid: string,
        accessId: string,
        roleUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(user, project.organizationUuid);

        await this.rolesModel.updateUserProjectAccess(accessId, roleUuid);

        this.analytics.track({
            event: 'project_access.updated',
            userId: user.userUuid,
            properties: {
                projectUuid,
                accessId,
                roleUuid,
            },
        });
    }

    async removeUserProjectAccess(
        user: SessionUser,
        projectUuid: string,
        accessId: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(user, project.organizationUuid);

        await this.rolesModel.removeUserProjectAccess(accessId);

        this.analytics.track({
            event: 'project_access.removed',
            userId: user.userUuid,
            properties: {
                projectUuid,
                accessId,
            },
        });
    }

    async addScopesToRole(
        user: SessionUser,
        roleUuid: string,
        scopeData: AddScopesToRole,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(user, role);

        await this.rolesModel.addScopesToRole(
            roleUuid,
            scopeData.scopeNames,
            user.userUuid,
        );

        this.analytics.track({
            event: 'role.scopes_added',
            userId: user.userUuid,
            properties: {
                roleUuid,
                scopeNames: scopeData.scopeNames,
                organizationUuid: role.organizationUuid,
            },
        });
    }

    async removeScopeFromRole(
        user: SessionUser,
        roleUuid: string,
        scopeName: string,
    ): Promise<void> {
        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(user, role);

        await this.rolesModel.removeScopeFromRole(roleUuid, scopeName);

        this.analytics.track({
            event: 'role.scope_removed',
            userId: user.userUuid,
            properties: {
                roleUuid,
                scopeName,
                organizationUuid: role.organizationUuid,
            },
        });
    }
}
