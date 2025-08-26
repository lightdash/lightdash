import {
    GroupProjectAccess,
    NotFoundError,
    OrganizationMemberRole,
    ProjectAccess,
    ProjectMemberRole,
    Role,
    RoleAssignment,
    RoleWithScopes,
    getSystemRoles,
    isSystemRole,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import {
    DbRole,
    DbRoleInsert,
    DbRoleUpdate,
    RolesTableName,
    ScopedRolesTableName,
} from '../database/entities/roles';
import { UserTableName } from '../database/entities/users';

type DbRoleWithScopes = DbRole & {
    scopes: string;
};

type DbOrganizationRoleAssignment = {
    customRoleUuid: string | null;
    customRoleName: string | null;
    roleName: string;
    assigneeId: string;
    assigneeName: string;
    organizationId: string;
    createdAt: Date;
    ownerType: string | null;
};

export class RolesModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    get db(): Knex {
        return this.database;
    }

    private async getOrganizationId(orgUuid: string): Promise<number> {
        const [orgData] = await this.database('organizations')
            .where('organization_uuid', orgUuid)
            .select('organization_id');

        if (!orgData) {
            throw new NotFoundError(
                `Organization with uuid ${orgUuid} not found`,
            );
        }

        return orgData.organization_id;
    }

    private async getProjectId(projectUuid: string): Promise<number> {
        const [projectData] = await this.database(ProjectTableName)
            .where('project_uuid', projectUuid)
            .select('project_id');

        if (!projectData) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }

        return projectData.project_id;
    }

    private async getUserId(userUuid: string): Promise<number> {
        const [userData] = await this.database('users')
            .where('user_uuid', userUuid)
            .select('user_id');

        if (!userData) {
            throw new NotFoundError(`User with uuid ${userUuid} not found`);
        }

        return userData.user_id;
    }

    private static mapDbRoleToRole(dbRole: DbRole): Role {
        return {
            roleUuid: dbRole.role_uuid,
            name: dbRole.name,
            description: dbRole.description,
            organizationUuid: dbRole.organization_uuid,
            createdBy: dbRole.created_by,
            createdAt: dbRole.created_at,
            updatedAt: dbRole.updated_at,
            ownerType: dbRole.owner_type,
        };
    }

    private static mapDbRoleWithScopesToRoleWithScopes(
        dbRole: DbRoleWithScopes,
    ): RoleWithScopes {
        return {
            ...RolesModel.mapDbRoleToRole(dbRole),
            scopes: dbRole.scopes ? dbRole.scopes.split(',') : [],
        };
    }

    async getRolesByOrganizationUuid(
        organizationUuid: string,
    ): Promise<Role[]> {
        const roles = await this.database(RolesTableName)
            .select('*')
            .where('organization_uuid', organizationUuid);

        const systemRoles = getSystemRoles();
        const customRoles = roles.map(RolesModel.mapDbRoleToRole);
        return [...systemRoles, ...customRoles];
    }

    async getRolesWithScopesByOrganizationUuid(
        organizationUuid: string,
    ): Promise<RoleWithScopes[]> {
        const roles = await this.database(RolesTableName)
            .leftJoin(
                ScopedRolesTableName,
                `${RolesTableName}.role_uuid`,
                `${ScopedRolesTableName}.role_uuid`,
            )
            .select(
                `${RolesTableName}.*`,
                this.database.raw(
                    `STRING_AGG(${ScopedRolesTableName}.scope_name, ',') as scopes`,
                ),
            )
            .where(`${RolesTableName}.organization_uuid`, organizationUuid)
            .groupBy(`${RolesTableName}.role_uuid`);

        const systemRoles = getSystemRoles();

        const customRoles = roles.map(
            RolesModel.mapDbRoleWithScopesToRoleWithScopes,
        );
        return [...systemRoles, ...customRoles];
    }

    async getRoleByUuid(roleUuid: string): Promise<Role> {
        if (isSystemRole(roleUuid)) {
            return getSystemRoles().find(
                (role) => role.roleUuid === roleUuid,
            ) as Role;
        }

        const [role] = await this.database(RolesTableName)
            .select('*')
            .where('role_uuid', roleUuid);

        if (!role) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleToRole(role);
    }

    async getRoleWithScopesByUuid(roleUuid: string): Promise<RoleWithScopes> {
        if (isSystemRole(roleUuid)) {
            return getSystemRoles().find(
                (role) => role.roleUuid === roleUuid,
            ) as RoleWithScopes;
        }

        const role = await this.database(RolesTableName)
            .leftJoin(
                ScopedRolesTableName,
                `${RolesTableName}.role_uuid`,
                `${ScopedRolesTableName}.role_uuid`,
            )
            .select(
                `${RolesTableName}.*`,
                this.database.raw(
                    `STRING_AGG(${ScopedRolesTableName}.scope_name, ',') as scopes`,
                ),
            )
            .where(`${RolesTableName}.role_uuid`, roleUuid)
            .groupBy(`${RolesTableName}.role_uuid`)
            .first();

        if (!role) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleWithScopesToRoleWithScopes(role);
    }

    async createRole(
        organizationUuid: string,
        roleData: Omit<DbRoleInsert, 'organization_uuid'>,
    ): Promise<Role> {
        const [role] = await this.database(RolesTableName)
            .insert({
                name: roleData.name,
                description: roleData.description,
                organization_uuid: organizationUuid,
                created_by: roleData.created_by,
            })
            .returning('*');

        return RolesModel.mapDbRoleToRole(role);
    }

    async updateRole(
        roleUuid: string,
        updateData: DbRoleUpdate,
    ): Promise<Role> {
        const [updatedRole] = await this.database(RolesTableName)
            .where('role_uuid', roleUuid)
            .update({
                ...updateData,
                updated_at: new Date(),
            })
            .returning('*');

        if (!updatedRole) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleToRole(updatedRole);
    }

    async deleteRole(roleUuid: string): Promise<void> {
        const deletedCount = await this.database(RolesTableName)
            .where('role_uuid', roleUuid)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }
    }

    async unassignCustomRoleFromUser(
        userUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid);

        const project = await this.database(ProjectTableName)
            .select('project_id')
            .where('project_uuid', projectUuid)
            .first();

        if (!project) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }

        await this.database(ProjectMembershipsTableName)
            .where('user_id', userId)
            .where('project_id', project.project_id)
            .update({ role_uuid: null });
    }

    async upsertSystemRoleGroupAccess(
        groupUuid: string,
        projectUuid: string,
        role: ProjectMemberRole,
    ): Promise<void> {
        await this.database('project_group_access')
            .insert({
                group_uuid: groupUuid,
                project_uuid: projectUuid,
                role,
                role_uuid: null,
            })
            .onConflict(['group_uuid', 'project_uuid'])
            .merge(['role', 'role_uuid']);
    }

    async upsertCustomRoleGroupAccess(
        groupUuid: string,
        projectUuid: string,
        roleUuid: string,
    ): Promise<void> {
        await this.database('project_group_access')
            .insert({
                group_uuid: groupUuid,
                project_uuid: projectUuid,
                role_uuid: roleUuid,
                role: ProjectMemberRole.VIEWER,
            })
            .onConflict(['group_uuid', 'project_uuid'])
            .merge(['role_uuid', 'role']);
    }

    async assignRoleToGroup(
        groupUuid: string,
        roleUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const existingAccess = await this.database('project_group_access')
            .where('group_uuid', groupUuid)
            .where('project_uuid', projectUuid)
            .first();

        if (existingAccess) {
            await this.database('project_group_access')
                .where('group_uuid', groupUuid)
                .where('project_uuid', projectUuid)
                .update({
                    role_uuid: roleUuid,
                    role: ProjectMemberRole.VIEWER,
                });
        } else {
            await this.database('project_group_access').insert({
                group_uuid: groupUuid,
                project_uuid: projectUuid,
                role_uuid: roleUuid,
                role: 'viewer' as ProjectMemberRole, // Default role when using custom role_uuid
            });
        }
    }

    async unassignRoleFromGroup(
        groupUuid: string,
        projectUuid: string,
    ): Promise<void> {
        await this.database('project_group_access')
            .where('group_uuid', groupUuid)
            .where('project_uuid', projectUuid)
            .delete();
    }

    // eslint-disable-next-line class-methods-use-this
    async getProjectAccess(projectUuid: string): Promise<ProjectAccess[]> {
        const access = await this.database(ProjectMembershipsTableName)
            .join(
                UserTableName,
                `${ProjectMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .join(
                ProjectTableName,
                `${ProjectMembershipsTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .leftJoin(
                RolesTableName,
                `${ProjectMembershipsTableName}.role_uuid`,
                `${RolesTableName}.role_uuid`,
            )
            .select(
                `${ProjectTableName}.project_uuid as projectUuid`,
                `${UserTableName}.user_uuid as userUuid`,
                `${RolesTableName}.role_uuid as roleUuid`,
                `${RolesTableName}.name as roleName`,
                `${ProjectMembershipsTableName}.role as role`,
                `${UserTableName}.first_name as firstName`,
                `${UserTableName}.last_name as lastName`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return access.map((ac) => ({
            userUuid: ac.userUuid,
            projectUuid: ac.projectUuid,
            roleUuid: ac.roleUuid || ac.role,
            roleName: ac.roleName || ac.role,
            firstName: ac.firstName,
            lastName: ac.lastName,
        }));
    }

    async getGroupProjectAccess(
        projectUuid: string,
    ): Promise<GroupProjectAccess[]> {
        const access = await this.database('project_group_access')
            .join(
                GroupTableName,
                'project_group_access.group_uuid',
                `${GroupTableName}.group_uuid`,
            )
            .join(
                ProjectTableName,
                'project_group_access.project_uuid',
                `${ProjectTableName}.project_uuid`,
            )
            .leftJoin(
                RolesTableName,
                'project_group_access.role_uuid',
                `${RolesTableName}.role_uuid`,
            )
            .select(
                `${GroupTableName}.group_uuid as groupUuid`,
                `${ProjectTableName}.project_uuid as projectUuid`,
                `${RolesTableName}.role_uuid as roleUuid`,
                `${RolesTableName}.name as roleName`,
                `project_group_access.role as role`,
                `${GroupTableName}.name as groupName`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return access.map((ac) => ({
            groupUuid: ac.groupUuid,
            projectUuid: ac.projectUuid,
            roleUuid: ac.roleUuid || ac.role,
            roleName: ac.roleName || ac.role,
            groupName: ac.groupName,
        }));
    }

    async upsertSystemRoleProjectAccess(
        projectUuid: string,
        userUuid: string,
        role: ProjectMemberRole,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid);
        const projectId = await this.getProjectId(projectUuid);

        await this.database(ProjectMembershipsTableName)
            .insert({
                project_id: projectId,
                user_id: userId,
                role,
                role_uuid: null,
            })
            .onConflict(['project_id', 'user_id'])
            .merge(['role', 'role_uuid']);
    }

    async upsertCustomRoleProjectAccess(
        projectUuid: string,
        userUuid: string,
        roleUuid: string,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid);
        const projectId = await this.getProjectId(projectUuid);

        await this.database(ProjectMembershipsTableName)
            .insert({
                project_id: projectId,
                user_id: userId,
                role_uuid: roleUuid,
                role: ProjectMemberRole.VIEWER,
            })
            .onConflict(['project_id', 'user_id'])
            .merge(['role_uuid', 'role']);
    }

    async removeUserProjectAccess(userUuid: string): Promise<void> {
        // Convert userUuid to user_id since the table uses user_id not user_uuid
        const userId = await this.getUserId(userUuid);

        const deletedCount = await this.database(ProjectMembershipsTableName)
            .where('user_id', userId)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError(`Access with id ${userUuid} not found`);
        }
    }

    async addScopesToRole(
        roleUuid: string,
        scopeNames: string[],
        grantedBy: string,
    ): Promise<void> {
        const scopeData = scopeNames.map((scopeName) => ({
            role_uuid: roleUuid,
            scope_name: scopeName,
            granted_by: grantedBy,
        }));

        await this.database(ScopedRolesTableName)
            .insert(scopeData)
            .onConflict(['role_uuid', 'scope_name'])
            .ignore();
    }

    async removeScopeFromRole(
        roleUuid: string,
        scopeName: string,
    ): Promise<void> {
        await this.database(ScopedRolesTableName)
            .where('role_uuid', roleUuid)
            .where('scope_name', scopeName)
            .delete();
    }

    // eslint-disable-next-line class-methods-use-this
    private mapOrganizationRoleAssignment(
        userAssignments: DbOrganizationRoleAssignment[],
    ): RoleAssignment[] {
        const formattedUserAssignments: RoleAssignment[] = userAssignments.map(
            (assignment) => ({
                roleId: assignment.customRoleUuid || assignment.roleName,
                roleName: assignment.customRoleName || assignment.roleName,
                assigneeType: 'user' as const,
                ownerType:
                    (assignment.ownerType as 'user' | 'system') || 'system',
                assigneeId: assignment.assigneeId,
                assigneeName: assignment.assigneeName,
                organizationId: assignment.organizationId,
                createdAt: assignment.createdAt,
                updatedAt: assignment.createdAt, // Use createdAt since updatedAt doesn't exist
            }),
        );
        return formattedUserAssignments;
    }

    async getOrganizationRoleAssignments(
        orgUuid: string,
    ): Promise<RoleAssignment[]> {
        const userAssignments: DbOrganizationRoleAssignment[] =
            await this.database('organization_memberships')
                .join(
                    'users',
                    'organization_memberships.user_id',
                    'users.user_id',
                )
                .join(
                    'organizations',
                    'organization_memberships.organization_id',
                    'organizations.organization_id',
                )
                .leftJoin(
                    'roles',
                    'organization_memberships.role_uuid',
                    'roles.role_uuid',
                )
                .select(
                    `${RolesTableName}.role_uuid as customRoleUuid`,
                    `${RolesTableName}.name as customRoleName`,

                    `${RolesTableName}.owner_type as ownerType`,
                    `${OrganizationMembershipsTableName}.role as roleName`,
                    'users.user_uuid as assigneeId',

                    this.database.raw(
                        "CONCAT(users.first_name, ' ', users.last_name) as assigneeName",
                    ),
                    'organizations.organization_uuid as organizationId',
                    'organization_memberships.created_at as createdAt',
                )
                .where('organizations.organization_uuid', orgUuid);

        return this.mapOrganizationRoleAssignment(userAssignments);
    }

    async upsertOrganizationUserRoleAssignment(
        orgUuid: string,
        userUuid: string,
        systemRoleId: string,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid);
        const orgId = await this.getOrganizationId(orgUuid);

        await this.database(OrganizationMembershipsTableName)
            .where({
                organization_id: orgId,
                user_id: userId,
            })
            .update({
                role: systemRoleId as OrganizationMemberRole,
                role_uuid: null, // Clear any custom role assignment
            });
    }
}
