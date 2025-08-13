import {
    NotFoundError,
    NotImplementedError,
    ProjectMemberRole,
    Role,
    RoleWithScopes,
    SessionUser,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
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

type ProjectAccess = {
    accessId: string;
    projectUuid: string;
    userUuid: string;
    role: string;
    firstName: string;
    lastName: string;
};

type GroupProjectAccess = {
    groupUuid: string;
    projectUuid: string;
    role: string;
    groupName: string;
};

export class RolesModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    get db(): Knex {
        return this.database;
    }

    private async getOrganizationId(organizationUuid: string): Promise<number> {
        const [orgData] = await this.database('organizations')
            .where('organization_uuid', organizationUuid)
            .select('organization_id');

        if (!orgData) {
            throw new NotFoundError(
                `Organization with uuid ${organizationUuid} not found`,
            );
        }

        return orgData.organization_id;
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
            .where('organization_uuid', organizationUuid)
            .orWhere('owner_type', 'system');

        return roles.map(RolesModel.mapDbRoleToRole);
    }

    async getRolesWithScopesByOrganizationUuid(
        organizationUuid: string,
    ): Promise<RoleWithScopes[]> {
        const query = this.database(RolesTableName)
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
            .orWhere(`${RolesTableName}.owner_type`, 'system')
            .groupBy(`${RolesTableName}.role_uuid`);

        const roles = await query;
        return roles.map(RolesModel.mapDbRoleWithScopesToRoleWithScopes);
    }

    async getRoleByUuid(roleUuid: string): Promise<Role> {
        const [role] = await this.database(RolesTableName)
            .select('*')
            .where('role_uuid', roleUuid);

        if (!role) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleToRole(role);
    }

    async createRole(
        organizationUuid: string,
        roleData: Omit<DbRoleInsert, 'organization_uuid'>,
        user: SessionUser,
    ): Promise<Role> {
        const [role] = await this.database(RolesTableName)
            .insert({
                name: roleData.name,
                description: roleData.description,
                organization_uuid: organizationUuid,
                created_by: user.userUuid,
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

    async assignRoleToUser(
        userUuid: string,
        roleUuid: string,
        organizationUuid?: string,
        projectUuid?: string,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid);

        if (organizationUuid) {
            const organizationId = await this.getOrganizationId(
                organizationUuid,
            );
            await this.database(OrganizationMembershipsTableName)
                .where('user_id', userId)
                .where('organization_id', organizationId)
                .update({ role_uuid: roleUuid });
        }

        if (projectUuid) {
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
                .update({ role_uuid: roleUuid });
        }
    }

    async unassignRoleFromUser(
        userUuid: string,
        organizationUuid?: string,
        projectUuid?: string,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid);

        if (organizationUuid) {
            const organizationId = await this.getOrganizationId(
                organizationUuid,
            );
            await this.database(OrganizationMembershipsTableName)
                .where('user_id', userId)
                .where('organization_id', organizationId)
                .update({ role_uuid: null });
        }

        if (projectUuid) {
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
    }

    async assignRoleToGroup(
        groupUuid: string,
        roleUuid: string,
        projectUuid?: string,
    ): Promise<void> {
        if (projectUuid) {
            const existingAccess = await this.database('project_group_access')
                .where('group_uuid', groupUuid)
                .where('project_uuid', projectUuid)
                .first();

            if (existingAccess) {
                await this.database('project_group_access')
                    .where('group_uuid', groupUuid)
                    .where('project_uuid', projectUuid)
                    .update({ role_uuid: roleUuid });
            } else {
                await this.database('project_group_access').insert({
                    group_uuid: groupUuid,
                    project_uuid: projectUuid,
                    role_uuid: roleUuid,
                    role: 'viewer' as ProjectMemberRole, // Default role when using custom role_uuid
                });
            }
        }
    }

    async unassignRoleFromGroup(
        groupUuid: string,
        projectUuid?: string,
    ): Promise<void> {
        await this.database('project_group_access')
            .where('group_uuid', groupUuid)
            .where('project_uuid', projectUuid)
            .delete();
    }

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
                `${UserTableName}.user_uuid as accessId`,
                `${ProjectTableName}.project_uuid as projectUuid`,
                `${UserTableName}.user_uuid as userUuid`,
                this.database.raw(
                    `COALESCE(${RolesTableName}.name, ${ProjectMembershipsTableName}.role) as role`,
                ),
                `${UserTableName}.first_name as firstName`,
                `${UserTableName}.last_name as lastName`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return access;
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
                this.database.raw(
                    `COALESCE(${RolesTableName}.name, 'viewer') as role`,
                ),
                `${GroupTableName}.name as groupName`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return access;
    }

    async createUserProjectAccess(
        projectUuid: string,
        userUuid: string,
        roleUuid: string,
    ): Promise<void> {
        const project = await this.database(ProjectTableName)
            .select('project_id')
            .where('project_uuid', projectUuid)
            .first();

        if (!project) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }

        const userId = await this.getUserId(userUuid);

        await this.database(ProjectMembershipsTableName)
            .insert({
                project_id: project.project_id,
                user_id: userId,
                role_uuid: roleUuid,
                role: ProjectMemberRole.VIEWER, // TODO set to null
            })
            .onConflict(['project_id', 'user_id'])
            .ignore();
    }

    async updateUserProjectAccess(
        accessId: string,
        roleUuid: string,
    ): Promise<void> {
        const updatedCount = await this.database(ProjectMembershipsTableName)
            .where('user_uuid', accessId)
            .update({ role_uuid: roleUuid });

        if (updatedCount === 0) {
            throw new NotFoundError(`Access with id ${accessId} not found`);
        }
    }

    async removeUserProjectAccess(accessId: string): Promise<void> {
        const deletedCount = await this.database(ProjectMembershipsTableName)
            .where('user_uuid', accessId)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError(`Access with id ${accessId} not found`);
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
}
