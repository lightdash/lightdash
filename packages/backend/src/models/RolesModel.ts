import {
    getSystemRoles,
    GroupProjectAccess,
    isSystemRole,
    NotFoundError,
    OrganizationMemberRole,
    Project,
    ProjectAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    Role,
    RoleAssignment,
    RoleWithScopes,
} from '@lightdash/common';
import { Knex } from 'knex';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import {
    DbProjectMembership,
    ProjectMembershipsTableName,
} from '../database/entities/projectMemberships';
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

    private async getOrganizationId(
        orgUuid: string,
        tx?: Knex.Transaction,
    ): Promise<number> {
        const [orgData] = await (tx || this.database)('organizations')
            .where('organization_uuid', orgUuid)
            .select('organization_id');

        if (!orgData) {
            throw new NotFoundError(
                `Organization with uuid ${orgUuid} not found`,
            );
        }

        return orgData.organization_id;
    }

    private async getProjectId(
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<number> {
        const [projectData] = await (tx || this.database)(ProjectTableName)
            .where('project_uuid', projectUuid)
            .select('project_id');

        if (!projectData) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }

        return projectData.project_id;
    }

    private async getUserId(
        userUuid: string,
        tx?: Knex.Transaction,
    ): Promise<number> {
        const [userData] = await (tx || this.database)('users')
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
        roleTypeFilter?: string,
        tx?: Knex.Transaction,
    ): Promise<Role[]> {
        if (roleTypeFilter === 'system') {
            return getSystemRoles();
        }

        const roles = await (tx || this.database)(RolesTableName)
            .select('*')
            .where('organization_uuid', organizationUuid);

        const customRoles = roles.map(RolesModel.mapDbRoleToRole);

        if (roleTypeFilter === 'user') {
            return customRoles;
        }

        const systemRoles = getSystemRoles();
        return [...systemRoles, ...customRoles];
    }

    async getRolesWithScopesByOrganizationUuid(
        organizationUuid: string,
        roleTypeFilter?: string,
        tx?: Knex.Transaction,
    ): Promise<RoleWithScopes[]> {
        if (roleTypeFilter === 'system') {
            return getSystemRoles();
        }

        const roles = await (tx || this.database)(RolesTableName)
            .leftJoin(
                ScopedRolesTableName,
                `${RolesTableName}.role_uuid`,
                `${ScopedRolesTableName}.role_uuid`,
            )
            .select(
                `${RolesTableName}.*`,
                (tx || this.database).raw(
                    `STRING_AGG(${ScopedRolesTableName}.scope_name, ',') as scopes`,
                ),
            )
            .where(`${RolesTableName}.organization_uuid`, organizationUuid)
            .groupBy(`${RolesTableName}.role_uuid`);

        const customRoles = roles.map(
            RolesModel.mapDbRoleWithScopesToRoleWithScopes,
        );

        if (roleTypeFilter === 'user') {
            return customRoles;
        }

        return [...getSystemRoles(), ...customRoles];
    }

    async getRoleByUuid(
        roleUuid: string,
        tx?: Knex.Transaction,
    ): Promise<Role> {
        if (isSystemRole(roleUuid)) {
            return getSystemRoles().find(
                (role) => role.roleUuid === roleUuid,
            ) as Role;
        }

        const [role] = await (tx || this.database)(RolesTableName)
            .select('*')
            .where('role_uuid', roleUuid);

        if (!role) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleToRole(role);
    }

    async getRoleWithScopesByUuid(
        roleUuid: string,
        tx?: Knex.Transaction,
    ): Promise<RoleWithScopes> {
        if (isSystemRole(roleUuid)) {
            return getSystemRoles().find(
                (role) => role.roleUuid === roleUuid,
            ) as RoleWithScopes;
        }

        const role = await (tx || this.database)(RolesTableName)
            .leftJoin(
                ScopedRolesTableName,
                `${RolesTableName}.role_uuid`,
                `${ScopedRolesTableName}.role_uuid`,
            )
            .select(
                `${RolesTableName}.*`,
                (tx || this.database).raw(
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
        tx?: Knex.Transaction,
    ): Promise<Role> {
        const [role] = await (tx || this.database)(RolesTableName)
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
        updateData: Omit<DbRoleUpdate, 'updated_at'>,
        tx?: Knex.Transaction,
    ): Promise<Role> {
        const [updatedRole] = await (tx || this.database)(RolesTableName)
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

    async deleteRole(roleUuid: string, tx?: Knex.Transaction): Promise<void> {
        const deletedCount = await (tx || this.database)(RolesTableName)
            .where('role_uuid', roleUuid)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError(`Role with uuid ${roleUuid} not found`);
        }
    }

    async unassignCustomRoleFromUser(
        userUuid: string,
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid, tx);

        const project = await (tx || this.database)(ProjectTableName)
            .select('project_id')
            .where('project_uuid', projectUuid)
            .first();

        if (!project) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }

        await (tx || this.database)(ProjectMembershipsTableName)
            .where('user_id', userId)
            .where('project_id', project.project_id)
            .update({ role_uuid: null });
    }

    private async getUserProjectRoles(
        userUuid: string,
        tx?: Knex.Transaction,
    ): Promise<
        Array<
            Pick<
                ProjectMemberProfile,
                'projectUuid' | 'role' | 'userUuid' | 'roleUuid'
            > &
                Pick<Project, 'type'>
        >
    > {
        const rows = await (tx || this.database)('project_memberships')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .select('*')
            .where('users.user_uuid', userUuid);

        return rows.map((row) => ({
            projectUuid: row.project_uuid,
            role: row.role || ProjectMemberRole.VIEWER,
            userUuid,
            roleUuid: row.role_uuid || undefined,
            type: row.project_type,
        }));
    }

    async getProjectAccessByUserUuid(
        userUuid: string,
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<DbProjectMembership[]> {
        const userId = await this.getUserId(userUuid, tx);
        const project = await (tx || this.database)(ProjectTableName)
            .select('project_id')
            .where('project_uuid', projectUuid)
            .first();

        if (!project) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }
        const projectAccess = await (tx || this.database)(
            ProjectMembershipsTableName,
        )
            .where('user_id', userId)
            .where('project_id', project.project_id)
            .select('*');
        return projectAccess;
    }

    async upsertSystemRoleGroupAccess(
        groupUuid: string,
        projectUuid: string,
        role: ProjectMemberRole,
        tx?: Knex.Transaction,
    ): Promise<void> {
        await (tx || this.database)('project_group_access')
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
        tx?: Knex.Transaction,
    ): Promise<void> {
        await (tx || this.database)('project_group_access')
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
        tx?: Knex.Transaction,
    ): Promise<void> {
        const existingAccess = await (tx || this.database)(
            'project_group_access',
        )
            .where('group_uuid', groupUuid)
            .where('project_uuid', projectUuid)
            .first();

        if (existingAccess) {
            await (tx || this.database)('project_group_access')
                .where('group_uuid', groupUuid)
                .where('project_uuid', projectUuid)
                .update({
                    role_uuid: roleUuid,
                    role: ProjectMemberRole.VIEWER,
                });
        } else {
            await (tx || this.database)('project_group_access').insert({
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
        tx?: Knex.Transaction,
    ): Promise<void> {
        await (tx || this.database)('project_group_access')
            .where('group_uuid', groupUuid)
            .where('project_uuid', projectUuid)
            .delete();
    }

    // eslint-disable-next-line class-methods-use-this
    async getProjectAccess(
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<ProjectAccess[]> {
        const access = await (tx || this.database)(ProjectMembershipsTableName)
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
        tx?: Knex.Transaction,
    ): Promise<GroupProjectAccess[]> {
        const access = await (tx || this.database)('project_group_access')
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
        tx?: Knex.Transaction,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid, tx);
        const projectId = await this.getProjectId(projectUuid, tx);

        await (tx || this.database)(ProjectMembershipsTableName)
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
        tx?: Knex.Transaction,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid, tx);
        const projectId = await this.getProjectId(projectUuid, tx);

        await (tx || this.database)(ProjectMembershipsTableName)
            .insert({
                project_id: projectId,
                user_id: userId,
                role_uuid: roleUuid,
                role: ProjectMemberRole.VIEWER,
            })
            .onConflict(['project_id', 'user_id'])
            .merge(['role_uuid', 'role']);
    }

    async removeUserAccessFromAllProjects(
        userUuid: string,
        tx?: Knex.Transaction,
    ): Promise<number> {
        // Convert userUuid to user_id since the table uses user_id not user_uuid
        const userId = await this.getUserId(userUuid, tx);
        return (tx || this.database)(ProjectMembershipsTableName)
            .where('user_id', userId)
            .delete();
    }

    async removeUserProjectAccess(
        userUuid: string,
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        // Convert userUuid to user_id since the table uses user_id not user_uuid
        const userId = await this.getUserId(userUuid, tx);
        const projectId = await this.getProjectId(projectUuid, tx);
        const deletedCount = await (tx || this.database)(
            ProjectMembershipsTableName,
        )
            .where('user_id', userId)
            .andWhere('project_id', projectId)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError(`Access with id ${userUuid} not found`);
        }
    }

    async addScopesToRole(
        roleUuid: string,
        scopeNames: string[],
        grantedBy: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        const scopeData = scopeNames.map((scopeName) => ({
            role_uuid: roleUuid,
            scope_name: scopeName,
            granted_by: grantedBy,
        }));

        await (tx || this.database)(ScopedRolesTableName)
            .insert(scopeData)
            .onConflict(['role_uuid', 'scope_name'])
            .ignore();
    }

    async removeScopeFromRole(
        roleUuid: string,
        scopeName: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        await (tx || this.database)(ScopedRolesTableName)
            .where('role_uuid', roleUuid)
            .where('scope_name', scopeName)
            .delete();
    }

    async removeScopesFromRole(
        roleUuid: string,
        scopeNames: string[],
        tx?: Knex.Transaction,
    ): Promise<void> {
        if (scopeNames.length === 0) {
            return;
        }

        await (tx || this.database)(ScopedRolesTableName)
            .where('role_uuid', roleUuid)
            .whereIn('scope_name', scopeNames)
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
        tx?: Knex.Transaction,
    ): Promise<RoleAssignment[]> {
        const userAssignments: DbOrganizationRoleAssignment[] = await (
            tx || this.database
        )('organization_memberships')
            .join('users', 'organization_memberships.user_id', 'users.user_id')
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

                (tx || this.database).raw(
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
        tx?: Knex.Transaction,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid, tx);
        const orgId = await this.getOrganizationId(orgUuid, tx);

        await (tx || this.database)(OrganizationMembershipsTableName)
            .where({
                organization_id: orgId,
                user_id: userId,
            })
            .update({
                role: systemRoleId as OrganizationMemberRole,
                role_uuid: null, // Clear any custom role assignment
            });
    }

    async getOrganizationAdmins(
        organizationUuid: string,
        tx?: Knex.Transaction,
    ): Promise<string[]> {
        const orgId = await this.getOrganizationId(organizationUuid, tx);
        const results = await (tx || this.database)(
            OrganizationMembershipsTableName,
        )
            .where(`${OrganizationMembershipsTableName}.organization_id`, orgId)
            .leftJoin(
                UserTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .andWhere('role', 'admin')
            .select(`${UserTableName}.user_uuid as userUuid`);
        return results.map((u) => u.userUuid);
    }

    /**
     * Set a user's organization and project roles to exactly match the provided values.
     * - Organization role is REQUIRED and must be a valid system organization role id (no custom role allowed).
     * - Project roles: adds or updates roles for listed projects; removes memberships for projects not present.
     * - If projectRoles is an empty array, all existing project memberships for the user are removed.
     * - If excludeProjectPreviews is true, preview projects are excluded from removal operations.
     * All operations are executed within a single transaction.
     */
    async setUserOrgAndProjectRoles(
        organizationUuid: string,
        userUuid: string,
        orgRoleId: OrganizationMemberRole,
        projectRoles: Array<{ projectUuid: string; roleId: string }>,
        excludeProjectPreviews: boolean = false,
        tx?: Knex.Transaction,
    ): Promise<void> {
        const runner = async (trx: Knex.Transaction) => {
            // Use dedicated upsert method for organization role assignment
            await this.upsertOrganizationUserRoleAssignment(
                organizationUuid,
                userUuid,
                orgRoleId,
                trx,
            );

            // Handle project roles if provided (empty array meaning remove all)
            // Deduplicate by projectUuid (keep last occurrence)
            const deduped = new Map<string, string>();
            projectRoles.forEach(({ projectUuid, roleId }) => {
                deduped.set(projectUuid, roleId);
            });

            const desiredProjectUuids = new Set<string>(deduped.keys());

            // Get current memberships for user (as project_uuids)
            const currentMemberships = await this.getUserProjectRoles(
                userUuid,
                trx,
            );
            const currentSet = currentMemberships.reduce<string[]>(
                (acc, m) =>
                    excludeProjectPreviews && m.type === ProjectType.PREVIEW
                        ? acc
                        : [...acc, m.projectUuid],
                [],
            );

            // Remove memberships not in desired set
            const removePromises: Promise<void>[] = [];
            for (const existingProjectUuid of currentSet) {
                if (!desiredProjectUuids.has(existingProjectUuid)) {
                    removePromises.push(
                        this.removeUserProjectAccess(
                            userUuid,
                            existingProjectUuid,
                            trx,
                        ),
                    );
                }
            }
            await Promise.all(removePromises);

            // Upsert desired roles
            const upsertPromises: Promise<void>[] = [];
            for (const [projectUuid, roleId] of deduped.entries()) {
                if (isSystemRole(roleId)) {
                    upsertPromises.push(
                        this.upsertSystemRoleProjectAccess(
                            projectUuid,
                            userUuid,
                            roleId as ProjectMemberRole,
                            trx,
                        ),
                    );
                } else {
                    upsertPromises.push(
                        this.upsertCustomRoleProjectAccess(
                            projectUuid,
                            userUuid,
                            roleId,
                            trx,
                        ),
                    );
                }
            }
            await Promise.all(upsertPromises);
        };

        if (tx) {
            await runner(tx);
        } else {
            await this.database.transaction(async (trx) => {
                await runner(trx);
            });
        }
    }
}
