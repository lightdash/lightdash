import { subject } from '@casl/ability';
import {
    Account,
    AddScopesToRole,
    CreateRole,
    ForbiddenError,
    isSystemRole,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    Role,
    RoleAssignment,
    RoleWithScopes,
    UpdateRole,
    UpdateRoleAssignmentRequest,
    UpsertUserRoleAssignmentRequest,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { GroupsModel } from '../../models/GroupsModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import { wrapSentryTransaction } from '../../utils';
import { BaseService } from '../BaseService';

type RolesServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    rolesModel: RolesModel;
    userModel: UserModel;
    organizationModel: OrganizationModel;
    groupsModel: GroupsModel;
    projectModel: ProjectModel;
    emailClient: EmailClient;
};

export class RolesService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly rolesModel: RolesModel;

    private readonly userModel: UserModel;

    private readonly organizationModel: OrganizationModel;

    private readonly groupsModel: GroupsModel;

    private readonly projectModel: ProjectModel;

    private readonly emailClient: EmailClient;

    constructor({
        lightdashConfig,
        analytics,
        rolesModel,
        userModel,
        organizationModel,
        groupsModel,
        projectModel,
        emailClient,
    }: RolesServiceArguments) {
        super({ serviceName: 'RolesService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.rolesModel = rolesModel;
        this.userModel = userModel;
        this.organizationModel = organizationModel;
        this.groupsModel = groupsModel;
        this.projectModel = projectModel;
        this.emailClient = emailClient;
    }

    /**
     * Validate that org admins or project developers/admins have access to view roles in the organization
     * @param account
     * @param organizationUuid
     * @private
     */
    private async validateRolesViewAccess(
        account: Account,
        organizationUuid: string,
    ) {
        // if user is admin of organization, they can see roles
        if (
            account.user.ability.can(
                'manage',
                subject('Organization', {
                    organizationUuid,
                }),
            )
        ) {
            return;
        }

        // get all projects in organization
        const projects = await wrapSentryTransaction(
            'RolesService.validateRolesViewAccess.getAllByOrganizationUuid',
            { organizationUuid },
            async () =>
                this.projectModel.getAllByOrganizationUuid(organizationUuid),
        );

        const canManageSomeProjects = projects.some((project) =>
            account.user.ability.can(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            ),
        );

        if (!canManageSomeProjects) {
            throw new ForbiddenError();
        }
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
        if (isSystemRole(role.roleUuid) && role.ownerType === 'system') {
            return;
        }

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
        roleTypeFilter?: string,
    ): Promise<Role[] | RoleWithScopes[]> {
        await this.validateRolesViewAccess(account, organizationUuid);

        if (loadScopes) {
            RolesService.validateOrganizationAccess(account, organizationUuid);
            return this.rolesModel.getRolesWithScopesByOrganizationUuid(
                organizationUuid,
                roleTypeFilter,
            );
        }

        return this.rolesModel.getRolesByOrganizationUuid(
            organizationUuid,
            roleTypeFilter,
        );
    }

    async createRole(
        account: Account,
        organizationUuid: string,
        createRoleData: CreateRole,
    ): Promise<Role> {
        const { scopes, name, description } = createRoleData;
        if (isSystemRole(name)) {
            throw new ParameterError(
                `Cannot create role with name "${name}", this is reserved for system roles`,
            );
        }

        RolesService.validateOrganizationAccess(account, organizationUuid);
        RolesService.validateRoleName(name);

        const role = await this.rolesModel.db.transaction(
            async (tx: Knex.Transaction) => {
                const createdRole = await this.rolesModel.createRole(
                    organizationUuid,
                    {
                        name,
                        description: description || null,
                        created_by: account.user?.id,
                    },
                    tx,
                );

                if (scopes && scopes.length > 0) {
                    await this.addScopesToRole(
                        account,
                        createdRole.roleUuid,
                        { scopeNames: scopes },
                        { tx, role: createdRole },
                    );
                }
                return createdRole;
            },
        );

        this.analytics.track({
            event: 'role.created',
            userId: account.user?.id,
            properties: {
                roleUuid: role.roleUuid,
                roleName: role.name,
                organizationUuid,
                scopes,
            },
        });

        return role;
    }

    async updateRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        updateRoleData: UpdateRole,
    ): Promise<Role> {
        const { scopes, name, description } = updateRoleData;

        if (isSystemRole(roleUuid)) {
            throw new ParameterError(`Cannot update system role "${roleUuid}"`);
        }

        const role = await this.rolesModel.getRoleByUuid(roleUuid);
        RolesService.validateRoleOwnership(account, role);

        if (name) {
            RolesService.validateRoleName(name);
        }

        await this.rolesModel.db.transaction(async (tx: Knex.Transaction) => {
            if (name || description) {
                await this.rolesModel.updateRole(
                    roleUuid,
                    { name, description },
                    tx,
                );
            }

            if (scopes && scopes.add.length > 0) {
                await this.addScopesToRole(
                    account,
                    roleUuid,
                    { scopeNames: scopes.add },
                    { tx, role },
                );
            }
            if (scopes && scopes.remove.length > 0) {
                await this.removeScopesFromRole(
                    account,
                    organizationUuid,
                    roleUuid,
                    scopes.remove,
                    tx,
                );
            }
        });
        const updatedRole = await this.rolesModel.getRoleWithScopesByUuid(
            roleUuid,
        );

        // We track add/remove scope analytics in their respective methods
        this.analytics.track({
            event: 'role.updated',
            userId: account.user?.id,
            properties: {
                roleUuid: updatedRole.roleUuid,
                roleName: updatedRole.name,
                organizationUuid,
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

    /* 
    At the organization level, we only support system role assignments
    */
    async getOrganizationRoleAssignments(
        account: Account,
        orgUuid: string,
    ): Promise<RoleAssignment[]> {
        await this.validateRolesViewAccess(account, orgUuid);

        // Get organization role assignments from model
        const userAssignments =
            await this.rolesModel.getOrganizationRoleAssignments(orgUuid);

        // Note: Groups don't have organization-level role assignments
        // Groups only have project-level and space-level access

        return userAssignments;
    }

    /**
     * Assign system role to user at organization level
     * Only system roles are allowed at organization level
     */
    async upsertOrganizationUserRoleAssignment(
        account: Account,
        orgUuid: string,
        userUuid: string,
        request: { roleId: string },
    ): Promise<RoleAssignment> {
        const { roleId } = request;

        // Validate organization access
        RolesService.validateOrganizationAccess(account, orgUuid);

        // Ensure only system roles can be assigned at organization level
        if (roleId !== OrganizationMemberRole.MEMBER && !isSystemRole(roleId)) {
            throw new ParameterError(
                'Only system roles can be assigned at organization level',
            );
        }

        const user = await this.userModel.getUserDetailsByUuid(userUuid);
        if (user.role === OrganizationMemberRole.ADMIN) {
            // If user is currently an admin, we need to check if there are more admins
            // because every org should have at least one admin
            const adminUuids = await this.rolesModel.getOrganizationAdmins(
                orgUuid,
            );
            if (adminUuids.length === 1) {
                throw new ParameterError(
                    'Organization must have at least one admin',
                );
            }
        }

        // Assign the system role at organization level
        await this.rolesModel.upsertOrganizationUserRoleAssignment(
            orgUuid,
            userUuid,
            roleId,
        );

        this.analytics.track({
            event: 'organization_role.assigned_to_user',
            userId: account.user?.id,
            properties: {
                organizationUuid: orgUuid,
                userUuid,
                roleId,
                isSystemRole: true,
            },
        });

        // Build response
        return {
            roleId,
            roleName: roleId,
            ownerType: 'system',
            assigneeType: 'user',
            assigneeId: userUuid,
            assigneeName: `${user.firstName} ${user.lastName}`,
            organizationId: orgUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
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
                roleId: userAccess.roleUuid,
                roleName: userAccess.roleName,
                ownerType: isSystemRole(userAccess.roleUuid)
                    ? 'system'
                    : 'user',
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
                roleId: groupAccess.roleUuid, // This might be role name for legacy
                roleName: groupAccess.roleName,
                ownerType: isSystemRole(groupAccess.roleUuid)
                    ? 'system'
                    : 'user',
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

    async updateProjectRoleAssignment(
        account: Account,
        projectId: string,
        assigneeId: string,
        assigneeType: 'user' | 'group',
        request: UpdateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        if (assigneeType === 'user') {
            return this.upsertProjectUserRoleAssignment(
                account,
                projectId,
                assigneeId,
                request,
            );
        }

        if (assigneeType === 'group') {
            return this.updateProjectGroupRoleAssignment(
                account,
                projectId,
                assigneeId,
                request,
            );
        }

        throw new ParameterError(`Invalid assignee type: ${assigneeType}`);
    }

    private async updateProjectGroupRoleAssignment(
        account: Account,
        projectId: string,
        groupId: string,
        request: UpdateRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        // Redirect to the new upsert method for consistency
        return this.upsertProjectGroupRoleAssignment(
            account,
            projectId,
            groupId,
            request,
        );
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

    async upsertProjectUserRoleAssignment(
        account: Account,
        projectUuid: string,
        userUuid: string,
        request: UpsertUserRoleAssignmentRequest,
    ): Promise<RoleAssignment> {
        const { roleId } = request;
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(
            account,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);
        const role = await this.rolesModel.getRoleWithScopesByUuid(roleId);

        const userProjectRole =
            await this.rolesModel.getProjectAccessByUserUuid(
                userUuid,
                projectUuid,
            );

        if (isSystemRole(roleId)) {
            await this.rolesModel.upsertSystemRoleProjectAccess(
                projectUuid,
                userUuid,
                roleId,
            );
        } else {
            if (role.scopes.length === 0) {
                throw new ParameterError(
                    'Custom role must have at least one scope',
                );
            }

            await this.rolesModel.upsertCustomRoleProjectAccess(
                projectUuid,
                userUuid,
                roleId,
            );
        }
        const user = await this.userModel.getUserDetailsByUuid(userUuid);

        // If the user is added to the project for the first time, send an invitation email
        const userEmail = user.email;
        const sendInvitationEmail =
            userProjectRole.length === 0 && request.sendEmail && userEmail;
        if (sendInvitationEmail) {
            this.logger.debug(
                `Sending email to ${userEmail} for project ${project.name} with role ${role.name}`,
            );
            const projectUrl = new URL(
                `/projects/${projectUuid}/home`,
                this.lightdashConfig.siteUrl,
            ).href;
            const data = isSystemRole(roleId)
                ? {
                      email: userEmail,
                      role: roleId,
                      sendEmail: true,
                  }
                : {
                      email: userEmail,
                      customRoleName: role.name,
                  };
            await this.emailClient.sendProjectAccessEmail(
                user,
                data,
                project.name,
                projectUrl,
            );
        }

        this.analytics.track({
            event: isSystemRole(roleId)
                ? 'project_access.upserted_system_role'
                : 'project_access.upserted_custom_role',
            userId: account.user?.id,
            properties: {
                projectUuid,
                userUuid,
                roleId,
                isSystemRole: isSystemRole(roleId),
            },
        });

        return {
            roleId,
            roleName: role.name,
            ownerType: 'user',
            assigneeType: 'user',
            assigneeId: userUuid,
            assigneeName: `${user.firstName} ${user.lastName}`,
            projectId: projectUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async upsertProjectGroupRoleAssignment(
        account: Account,
        projectUuid: string,
        groupUuid: string,
        request: UpsertUserRoleAssignmentRequest, // Reusing the same request type
    ): Promise<RoleAssignment> {
        const { roleId } = request;
        const project = await this.projectModel.getSummary(projectUuid);
        RolesService.validateOrganizationAccess(
            account,
            project.organizationUuid,
        );
        await this.validateProjectAccess(account, projectUuid);
        const role = await this.rolesModel.getRoleWithScopesByUuid(roleId);

        if (isSystemRole(roleId)) {
            await this.rolesModel.upsertSystemRoleGroupAccess(
                groupUuid,
                projectUuid,
                roleId,
            );
        } else {
            if (role.scopes.length === 0) {
                throw new ParameterError(
                    'Custom role must have at least one scope',
                );
            }

            await this.rolesModel.upsertCustomRoleGroupAccess(
                groupUuid,
                projectUuid,
                roleId,
            );
        }

        this.analytics.track({
            event: isSystemRole(roleId)
                ? 'project_group_access.upserted_system_role'
                : 'project_group_access.upserted_custom_role',
            userId: account.user?.id,
            properties: {
                projectUuid,
                groupUuid,
                roleId,
                isSystemRole: isSystemRole(roleId),
            },
        });

        const group = await this.groupsModel.getGroup(groupUuid);
        return {
            roleId,
            roleName: role.name,
            ownerType: 'user',
            assigneeType: 'group',
            assigneeId: groupUuid,
            assigneeName: group.name,
            projectId: projectUuid,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    async deleteRole(account: Account, roleUuid: string): Promise<void> {
        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot remove system roles');
        }
        try {
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
        } catch (error) {
            const foreignKeyViolation = '23503';
            if (
                error instanceof DatabaseError &&
                error.code === foreignKeyViolation
            ) {
                throw new ParameterError('Role cannot be deleted if assigned');
            }

            throw error;
        }
    }

    async unassignRoleFromUser(
        account: Account,
        userUuid: string,
        organizationUuid: string,
        projectUuid: string,
    ): Promise<void> {
        RolesService.validateOrganizationAccess(account, organizationUuid);
        await this.validateProjectAccess(account, projectUuid);

        await this.rolesModel.unassignCustomRoleFromUser(userUuid, projectUuid);

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
        projectUuid: string,
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
        projectUuid: string,
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

    private async getProjectAccess(account: Account, projectUuid: string) {
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

        await this.rolesModel.removeUserProjectAccess(userUuid, projectUuid);

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
        { tx, role }: { tx?: Knex.Transaction; role?: Role } = {},
    ): Promise<void> {
        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot add scopes to system roles');
        }

        const foundRole =
            role || (await this.rolesModel.getRoleByUuid(roleUuid));
        RolesService.validateRoleOwnership(account, foundRole);

        await this.rolesModel.addScopesToRole(
            roleUuid,
            scopeData.scopeNames,
            account.user?.id,
            tx,
        );

        this.analytics.track({
            event: 'role.scopes_added',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeNames: scopeData.scopeNames,
                organizationUuid: foundRole.organizationUuid,
            },
        });
    }

    async removeScopeFromRole(
        account: Account,
        roleUuid: string,
        scopeName: string,
    ): Promise<void> {
        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot remove scopes from system roles');
        }

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

    async removeScopesFromRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        scopeNames: string[],
        tx?: Knex.Transaction,
    ): Promise<void> {
        RolesService.validateOrganizationAccess(account, organizationUuid);

        if (scopeNames.filter(Boolean).length === 0) {
            throw new ParameterError('scopeNames are required');
        }

        if (isSystemRole(roleUuid)) {
            throw new ParameterError('Cannot remove scopes from system roles');
        }

        await this.rolesModel.removeScopesFromRole(roleUuid, scopeNames, tx);

        this.analytics.track({
            event: 'role.scopes_removed',
            userId: account.user?.id,
            properties: {
                roleUuid,
                scopeNames,
                organizationUuid,
            },
        });
    }

    async duplicateRole(
        account: Account,
        organizationUuid: string,
        roleUuid: string,
        duplicateRoleData: CreateRole,
    ): Promise<RoleWithScopes> {
        RolesService.validateOrganizationAccess(account, organizationUuid);

        const { name, description } = duplicateRoleData;
        RolesService.validateRoleName(name);

        const sourceRole = await this.rolesModel.getRoleWithScopesByUuid(
            roleUuid,
        );
        if (!sourceRole) {
            throw new NotFoundError(`Role to duplicate: ${roleUuid} not found`);
        }
        RolesService.validateRoleOwnership(account, sourceRole);

        const copyOfRoleName = `Copy of: ${sourceRole.name}`;
        const newDescription =
            description || sourceRole.description || copyOfRoleName;
        const newRole = await this.rolesModel.db.transaction(
            async (tx: Knex.Transaction) => {
                const role = await this.rolesModel.createRole(
                    organizationUuid,
                    {
                        name,
                        description: newDescription,
                        created_by: account.user?.id,
                    },
                    tx,
                );

                if (sourceRole.scopes.length > 0) {
                    await this.addScopesToRole(
                        account,
                        role.roleUuid,
                        { scopeNames: sourceRole.scopes },
                        { tx, role },
                    );
                }
                return role;
            },
        );

        this.analytics.track({
            event: 'role.duplicated',
            userId: account.user?.id,
            properties: {
                sourceRoleUuid: roleUuid,
                newRoleUuid: newRole.roleUuid,
                newRoleName: newRole.name,
                isSourceSystemRole: isSystemRole(roleUuid),
                organizationUuid,
                scopeCount: sourceRole.scopes.length,
            },
        });

        return {
            ...newRole,
            scopes: sourceRole.scopes,
        };
    }
}
