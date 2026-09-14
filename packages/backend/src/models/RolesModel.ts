import {
    AlreadyExistsError,
    ForbiddenError,
    getSystemRoles,
    GroupProjectAccess,
    isOrganizationMemberRole,
    isSystemRole,
    NotFoundError,
    OrganizationMemberRole,
    OrganizationRoleSet,
    ParameterError,
    Project,
    ProjectAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectRoleSet,
    ProjectType,
    Role,
    RoleAssignee,
    RoleAssignment,
    RoleLevel,
    RoleWithScopes,
} from '@lightdash/common';
import { Knex } from 'knex';
import { validate as isValidUuid } from 'uuid';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectGroupAccessCustomRolesTableName } from '../database/entities/projectGroupAccessCustomRoles';
import { ProjectMembershipCustomRolesTableName } from '../database/entities/projectMembershipCustomRoles';
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
import { isUniqueConstraintViolation } from '../database/errors';
import {
    assertAdminDemotionAllowed,
    assertAnotherActiveAdminInOrganization,
    clearGroupExtraRoles,
    clearOrganizationExtraRoles,
    clearProjectExtraRoles,
    joinRoleSet,
    normalizeRoleSet,
    ORGANIZATION_PLACEHOLDER_ROLE,
    PROJECT_PLACEHOLDER_ROLE,
    replaceExtraRoles,
    splitRoleSet,
} from './roleSetUtils';

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
    hasExtraRoles: boolean;
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
            level: dbRole.level,
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
        try {
            const [role] = await (tx || this.database)(RolesTableName)
                .insert({
                    name: roleData.name,
                    description: roleData.description,
                    level: roleData.level,
                    organization_uuid: organizationUuid,
                    created_by: roleData.created_by,
                })
                .returning('*');

            return RolesModel.mapDbRoleToRole(role);
        } catch (error) {
            if (isUniqueConstraintViolation(error)) {
                throw new AlreadyExistsError(
                    `A role named "${roleData.name}" already exists in this organization`,
                );
            }
            throw error;
        }
    }

    async updateRole(
        roleUuid: string,
        updateData: Omit<DbRoleUpdate, 'updated_at'>,
        tx?: Knex.Transaction,
    ): Promise<Role> {
        let updatedRole: DbRole | undefined;
        try {
            [updatedRole] = await (tx || this.database)(RolesTableName)
                .where('role_uuid', roleUuid)
                .update({
                    ...updateData,
                    updated_at: new Date(),
                })
                .returning('*');
        } catch (error) {
            if (isUniqueConstraintViolation(error)) {
                throw new AlreadyExistsError(
                    updateData.name
                        ? `A role named "${updateData.name}" already exists in this organization`
                        : `A role with this name already exists in this organization`,
                );
            }
            throw error;
        }

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

    // The three FK sources that block role deletion (RESTRICT in
    // 20250807212731_add_custom_roles), unioned into a single flat list for
    // the delete-confirmation modal. The org-membership branch additionally
    // LEFT JOINs `service_accounts` so SA-linked user rows surface as
    // `service_account` instead of `organization_user` — service accounts
    // are invisible in the regular member UI, so without this distinction
    // the modal would mislabel them as users.
    async getRoleAssignees(roleUuid: string): Promise<RoleAssignee[]> {
        const orgRows = await this.database(OrganizationMembershipsTableName)
            .join(
                UserTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .leftJoin(
                'service_accounts',
                'service_accounts.service_account_user_uuid',
                `${UserTableName}.user_uuid`,
            )
            .where((qb) =>
                qb
                    .where(
                        `${OrganizationMembershipsTableName}.role_uuid`,
                        roleUuid,
                    )
                    .orWhereIn(
                        [
                            `${OrganizationMembershipsTableName}.organization_id`,
                            `${OrganizationMembershipsTableName}.user_id`,
                        ],
                        this.database(
                            OrganizationMembershipCustomRolesTableName,
                        )
                            .select('organization_id', 'user_id')
                            .where('role_uuid', roleUuid),
                    ),
            )
            .select<
                Array<{
                    userUuid: string;
                    firstName: string;
                    lastName: string;
                    serviceAccountUuid: string | null;
                    serviceAccountDescription: string | null;
                }>
            >(
                `${UserTableName}.user_uuid as userUuid`,
                `${UserTableName}.first_name as firstName`,
                `${UserTableName}.last_name as lastName`,
                'service_accounts.service_account_uuid as serviceAccountUuid',
                'service_accounts.description as serviceAccountDescription',
            );

        const projectUserRows = await this.database(ProjectMembershipsTableName)
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
            .where((qb) =>
                qb
                    .where(`${ProjectMembershipsTableName}.role_uuid`, roleUuid)
                    .orWhereIn(
                        [
                            `${ProjectMembershipsTableName}.project_id`,
                            `${ProjectMembershipsTableName}.user_id`,
                        ],
                        this.database(ProjectMembershipCustomRolesTableName)
                            .select('project_id', 'user_id')
                            .where('role_uuid', roleUuid),
                    ),
            )
            .select<
                Array<{
                    userUuid: string;
                    firstName: string;
                    lastName: string;
                    projectUuid: string;
                    projectName: string;
                }>
            >(
                `${UserTableName}.user_uuid as userUuid`,
                `${UserTableName}.first_name as firstName`,
                `${UserTableName}.last_name as lastName`,
                `${ProjectTableName}.project_uuid as projectUuid`,
                `${ProjectTableName}.name as projectName`,
            );

        const projectGroupRows = await this.database(
            ProjectGroupAccessTableName,
        )
            .join(
                GroupTableName,
                `${ProjectGroupAccessTableName}.group_uuid`,
                `${GroupTableName}.group_uuid`,
            )
            .join(
                ProjectTableName,
                `${ProjectGroupAccessTableName}.project_uuid`,
                `${ProjectTableName}.project_uuid`,
            )
            .where((qb) =>
                qb
                    .where(`${ProjectGroupAccessTableName}.role_uuid`, roleUuid)
                    .orWhereIn(
                        [
                            `${ProjectGroupAccessTableName}.project_uuid`,
                            `${ProjectGroupAccessTableName}.group_uuid`,
                        ],
                        this.database(ProjectGroupAccessCustomRolesTableName)
                            .select('project_uuid', 'group_uuid')
                            .where('role_uuid', roleUuid),
                    ),
            )
            .select<
                Array<{
                    groupUuid: string;
                    groupName: string;
                    projectUuid: string;
                    projectName: string;
                }>
            >(
                `${GroupTableName}.group_uuid as groupUuid`,
                `${GroupTableName}.name as groupName`,
                `${ProjectTableName}.project_uuid as projectUuid`,
                `${ProjectTableName}.name as projectName`,
            );

        const fullName = (
            firstName: string,
            lastName: string,
            fallback: string,
        ) => `${firstName ?? ''} ${lastName ?? ''}`.trim() || fallback;

        const assignees: RoleAssignee[] = [];

        for (const row of orgRows) {
            if (row.serviceAccountUuid) {
                assignees.push({
                    kind: 'service_account',
                    assigneeId: row.serviceAccountUuid,
                    assigneeName:
                        row.serviceAccountDescription ||
                        'Unnamed service account',
                    projectUuid: null,
                    projectName: null,
                });
            } else {
                assignees.push({
                    kind: 'organization_user',
                    assigneeId: row.userUuid,
                    assigneeName: fullName(
                        row.firstName,
                        row.lastName,
                        row.userUuid,
                    ),
                    projectUuid: null,
                    projectName: null,
                });
            }
        }

        for (const row of projectUserRows) {
            assignees.push({
                kind: 'project_user',
                assigneeId: row.userUuid,
                assigneeName: fullName(
                    row.firstName,
                    row.lastName,
                    row.userUuid,
                ),
                projectUuid: row.projectUuid,
                projectName: row.projectName,
            });
        }

        for (const row of projectGroupRows) {
            assignees.push({
                kind: 'project_group',
                assigneeId: row.groupUuid,
                assigneeName: row.groupName,
                projectUuid: row.projectUuid,
                projectName: row.projectName,
            });
        }

        return assignees;
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

        await this.runInTransaction(async (trx) => {
            await trx(ProjectMembershipsTableName)
                .where('user_id', userId)
                .where('project_id', project.project_id)
                .update({ role_uuid: null });
            await clearProjectExtraRoles(trx, project.project_id, userId);
        }, tx);
    }

    async getUserProjectRoles(
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
        type Row = {
            project_uuid: string;
            project_type: ProjectType;
            role: ProjectMemberRole | null;
            role_uuid: string | null;
        };
        const rows = await (tx || this.database)('project_memberships')
            .leftJoin(
                'projects',
                'project_memberships.project_id',
                'projects.project_id',
            )
            .leftJoin('users', 'project_memberships.user_id', 'users.user_id')
            .select<Row[]>([
                'projects.project_uuid',
                'projects.project_type',
                'project_memberships.role',
                'project_memberships.role_uuid',
            ])
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
        await this.runInTransaction(async (trx) => {
            await trx('project_group_access')
                .insert({
                    group_uuid: groupUuid,
                    project_uuid: projectUuid,
                    role,
                    role_uuid: null,
                })
                .onConflict(['group_uuid', 'project_uuid'])
                .merge(['role', 'role_uuid']);
            await clearGroupExtraRoles(trx, projectUuid, groupUuid);
        }, tx);
    }

    async upsertCustomRoleGroupAccess(
        groupUuid: string,
        projectUuid: string,
        roleUuid: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        await this.runInTransaction(async (trx) => {
            await trx('project_group_access')
                .insert({
                    group_uuid: groupUuid,
                    project_uuid: projectUuid,
                    role_uuid: roleUuid,
                    role: ProjectMemberRole.VIEWER,
                })
                .onConflict(['group_uuid', 'project_uuid'])
                .merge(['role_uuid', 'role']);
            await clearGroupExtraRoles(trx, projectUuid, groupUuid);
        }, tx);
    }

    async assignRoleToGroup(
        groupUuid: string,
        roleUuid: string,
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        await this.runInTransaction(async (trx) => {
            const existingAccess = await trx('project_group_access')
                .where('group_uuid', groupUuid)
                .where('project_uuid', projectUuid)
                .first();

            if (existingAccess) {
                await trx('project_group_access')
                    .where('group_uuid', groupUuid)
                    .where('project_uuid', projectUuid)
                    .update({
                        role_uuid: roleUuid,
                        role: ProjectMemberRole.VIEWER,
                    });
            } else {
                await trx('project_group_access').insert({
                    group_uuid: groupUuid,
                    project_uuid: projectUuid,
                    role_uuid: roleUuid,
                    role: 'viewer' as ProjectMemberRole, // Default role when using custom role_uuid
                });
            }
            await clearGroupExtraRoles(trx, projectUuid, groupUuid);
        }, tx);
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
                (tx || this.database).raw(
                    `EXISTS (SELECT 1 FROM ?? AS x WHERE x.project_id = ??.project_id AND x.user_id = ??.user_id) AS "hasExtraRoles"`,
                    [
                        ProjectMembershipCustomRolesTableName,
                        ProjectMembershipsTableName,
                        ProjectMembershipsTableName,
                    ],
                ),
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return access.map((ac) => ({
            userUuid: ac.userUuid,
            projectUuid: ac.projectUuid,
            roleUuid: ac.roleUuid || ac.role,
            roleName: ac.roleName || ac.role,
            firstName: ac.firstName,
            lastName: ac.lastName,
            hasMultipleRoles: ac.hasExtraRoles,
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
                (tx || this.database).raw(
                    `EXISTS (SELECT 1 FROM ?? AS x WHERE x.project_uuid = project_group_access.project_uuid AND x.group_uuid = project_group_access.group_uuid) AS "hasExtraRoles"`,
                    [ProjectGroupAccessCustomRolesTableName],
                ),
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        return access.map((ac) => ({
            groupUuid: ac.groupUuid,
            projectUuid: ac.projectUuid,
            roleUuid: ac.roleUuid || ac.role,
            roleName: ac.roleName || ac.role,
            groupName: ac.groupName,
            hasMultipleRoles: ac.hasExtraRoles,
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

        await this.runInTransaction(async (trx) => {
            await trx(ProjectMembershipsTableName)
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    role,
                    role_uuid: null,
                })
                .onConflict(['project_id', 'user_id'])
                .merge(['role', 'role_uuid']);
            await clearProjectExtraRoles(trx, projectId, userId);
        }, tx);
    }

    async upsertCustomRoleProjectAccess(
        projectUuid: string,
        userUuid: string,
        roleUuid: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid, tx);
        const projectId = await this.getProjectId(projectUuid, tx);

        await this.runInTransaction(async (trx) => {
            await trx(ProjectMembershipsTableName)
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    role_uuid: roleUuid,
                    role: ProjectMemberRole.VIEWER,
                })
                .onConflict(['project_id', 'user_id'])
                .merge(['role_uuid', 'role']);
            await clearProjectExtraRoles(trx, projectId, userId);
        }, tx);
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
                hasMultipleRoles: assignment.hasExtraRoles,
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
            // Hide internal user records (service accounts, etc.) from the
            // role-assignment admin UI; they're shown via their entity table
            // (e.g. /service-accounts), not the role assignments listing.
            .where('users.is_internal', false)
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
                (tx || this.database).raw(
                    `EXISTS (SELECT 1 FROM ?? AS x WHERE x.organization_id = organization_memberships.organization_id AND x.user_id = organization_memberships.user_id) AS "hasExtraRoles"`,
                    [OrganizationMembershipCustomRolesTableName],
                ),
            )
            .where('organizations.organization_uuid', orgUuid);

        return this.mapOrganizationRoleAssignment(userAssignments);
    }

    async upsertOrganizationUserRoleAssignment(
        orgUuid: string,
        userUuid: string,
        roleId: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        const userId = await this.getUserId(userUuid, tx);
        const orgId = await this.getOrganizationId(orgUuid, tx);

        const isSystemOrganizationRole = isOrganizationMemberRole(roleId);

        await this.runInTransaction(async (trx) => {
            await assertAdminDemotionAllowed(
                trx,
                orgId,
                userId,
                isSystemOrganizationRole ? roleId : null,
            );
            await trx(OrganizationMembershipsTableName)
                .where({
                    organization_id: orgId,
                    user_id: userId,
                })
                .update({
                    role: isSystemOrganizationRole
                        ? roleId
                        : OrganizationMemberRole.MEMBER,
                    role_uuid: isSystemOrganizationRole ? null : roleId,
                });
            await clearOrganizationExtraRoles(trx, orgId, userId);
        }, tx);
    }

    private async getProjectOrganizationUuid(
        projectUuid: string,
        tx?: Knex.Transaction,
    ): Promise<string> {
        const row = await (tx || this.database)(ProjectTableName)
            .join(
                'organizations',
                `${ProjectTableName}.organization_id`,
                'organizations.organization_id',
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .first<{ organization_uuid: string }>(
                'organizations.organization_uuid',
            );
        if (!row) {
            throw new NotFoundError(
                `Project with uuid ${projectUuid} not found`,
            );
        }
        return row.organization_uuid;
    }

    private async assertGroupInOrganization(
        groupUuid: string,
        orgUuid: string,
        tx?: Knex.Transaction,
    ): Promise<void> {
        const row = await (tx || this.database)(GroupTableName)
            .join(
                'organizations',
                `${GroupTableName}.organization_id`,
                'organizations.organization_id',
            )
            .where(`${GroupTableName}.group_uuid`, groupUuid)
            .first<{ organization_uuid: string }>(
                'organizations.organization_uuid',
            );
        if (!row || row.organization_uuid !== orgUuid) {
            throw new NotFoundError(`Group with uuid ${groupUuid} not found`);
        }
    }

    private async getOrganizationMemberUserId(
        orgUuid: string,
        userUuid: string,
        tx?: Knex.Transaction,
    ): Promise<number> {
        const row = await (tx || this.database)(UserTableName)
            .join(
                OrganizationMembershipsTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .join(
                'organizations',
                'organizations.organization_id',
                `${OrganizationMembershipsTableName}.organization_id`,
            )
            .where(`${UserTableName}.user_uuid`, userUuid)
            .where('organizations.organization_uuid', orgUuid)
            .first<{ user_id: number }>(`${UserTableName}.user_id`);
        if (!row) {
            throw new NotFoundError(
                `User ${userUuid} is not a member of the project's organization`,
            );
        }
        return row.user_id;
    }

    /**
     * Ensures every custom role exists, belongs to the organization and has
     * the expected level. Missing or foreign roles are reported as not found.
     */
    private async validateCustomRoles(
        orgUuid: string,
        customRoleUuids: string[],
        level: RoleLevel,
        tx?: Knex.Transaction,
    ): Promise<void> {
        if (customRoleUuids.length === 0) {
            return;
        }
        const malformed = customRoleUuids.filter((u) => !isValidUuid(u));
        if (malformed.length > 0) {
            throw new ParameterError(
                `Invalid custom role id(s): ${malformed.join(', ')}`,
            );
        }
        const rows = await (tx || this.database)(RolesTableName)
            .select<Pick<DbRole, 'role_uuid' | 'level'>[]>('role_uuid', 'level')
            .where('organization_uuid', orgUuid)
            .where('owner_type', 'user')
            .whereIn('role_uuid', customRoleUuids);
        const byUuid = new Map(rows.map((r) => [r.role_uuid, r.level]));
        const missing = customRoleUuids.filter((u) => !byUuid.has(u));
        if (missing.length > 0) {
            throw new NotFoundError(
                `Custom role(s) not found in organization: ${missing.join(', ')}`,
            );
        }
        const wrongLevel = customRoleUuids.filter(
            (u) => byUuid.get(u) !== level,
        );
        if (wrongLevel.length > 0) {
            throw new ParameterError(
                `Custom role(s) are not ${level}-level roles: ${wrongLevel.join(', ')}`,
            );
        }
    }

    async getOrganizationUserRoleSet(
        orgUuid: string,
        userUuid: string,
        tx?: Knex.Transaction,
    ): Promise<OrganizationRoleSet> {
        const userId = await this.getUserId(userUuid, tx);
        const orgId = await this.getOrganizationId(orgUuid, tx);
        const membership = await (tx || this.database)(
            OrganizationMembershipsTableName,
        )
            .where({ organization_id: orgId, user_id: userId })
            .first('role', 'role_uuid');
        if (!membership) {
            throw new NotFoundError(
                `User ${userUuid} is not a member of organization ${orgUuid}`,
            );
        }
        const extras = await (tx || this.database)(
            OrganizationMembershipCustomRolesTableName,
        )
            .where({ organization_id: orgId, user_id: userId })
            .orderBy([{ column: 'created_at' }, { column: 'role_uuid' }])
            .pluck('role_uuid');
        return joinRoleSet(
            { role: membership.role, roleUuid: membership.role_uuid ?? null },
            extras,
        );
    }

    async getProjectUserRoleSet(
        projectUuid: string,
        userUuid: string,
        tx?: Knex.Transaction,
    ): Promise<ProjectRoleSet> {
        const userId = await this.getUserId(userUuid, tx);
        const projectId = await this.getProjectId(projectUuid, tx);
        const membership = await (tx || this.database)(
            ProjectMembershipsTableName,
        )
            .where({ project_id: projectId, user_id: userId })
            .first('role', 'role_uuid');
        if (!membership) {
            throw new NotFoundError(
                `User ${userUuid} has no direct access to project ${projectUuid}`,
            );
        }
        const extras = await (tx || this.database)(
            ProjectMembershipCustomRolesTableName,
        )
            .where({ project_id: projectId, user_id: userId })
            .orderBy([{ column: 'created_at' }, { column: 'role_uuid' }])
            .pluck('role_uuid');
        return joinRoleSet(
            {
                role: membership.role ?? PROJECT_PLACEHOLDER_ROLE,
                roleUuid: membership.role_uuid ?? null,
            },
            extras,
        );
    }

    async getProjectGroupRoleSet(
        projectUuid: string,
        groupUuid: string,
        tx?: Knex.Transaction,
    ): Promise<ProjectRoleSet> {
        const access = await (tx || this.database)(ProjectGroupAccessTableName)
            .where({ project_uuid: projectUuid, group_uuid: groupUuid })
            .first('role', 'role_uuid');
        if (!access) {
            throw new NotFoundError(
                `Group ${groupUuid} has no access to project ${projectUuid}`,
            );
        }
        const extras = await (tx || this.database)(
            ProjectGroupAccessCustomRolesTableName,
        )
            .where({ project_uuid: projectUuid, group_uuid: groupUuid })
            .orderBy([{ column: 'created_at' }, { column: 'role_uuid' }])
            .pluck('role_uuid');
        return joinRoleSet(
            { role: access.role, roleUuid: access.role_uuid ?? null },
            extras,
        );
    }

    /** Atomically replaces the user's organization role set (membership must exist). */
    async replaceOrganizationUserRoleSet(
        orgUuid: string,
        userUuid: string,
        roleSet: OrganizationRoleSet,
        tx?: Knex.Transaction,
    ): Promise<OrganizationRoleSet> {
        const set = normalizeRoleSet(roleSet);
        const runner = async (trx: Knex.Transaction) => {
            await this.validateCustomRoles(
                orgUuid,
                set.customRoleUuids,
                'organization',
                trx,
            );
            const userId = await this.getUserId(userUuid, trx);
            const orgId = await this.getOrganizationId(orgUuid, trx);
            await assertAdminDemotionAllowed(
                trx,
                orgId,
                userId,
                set.systemRole,
            );
            const { slot, extraRoleUuids } = splitRoleSet(
                set,
                ORGANIZATION_PLACEHOLDER_ROLE,
            );
            const updated = await trx(OrganizationMembershipsTableName)
                .where({ organization_id: orgId, user_id: userId })
                .update({ role: slot.role, role_uuid: slot.roleUuid });
            if (updated === 0) {
                throw new NotFoundError(
                    `User ${userUuid} is not a member of organization ${orgUuid}`,
                );
            }
            await replaceExtraRoles(
                trx,
                OrganizationMembershipCustomRolesTableName,
                { organization_id: orgId, user_id: userId },
                extraRoleUuids,
            );
            return this.getOrganizationUserRoleSet(orgUuid, userUuid, trx);
        };
        return this.runInTransaction(runner, tx);
    }

    /** Atomically replaces the user's direct project role set, creating access if needed. */
    async replaceProjectUserRoleSet(
        projectUuid: string,
        userUuid: string,
        roleSet: ProjectRoleSet,
        tx?: Knex.Transaction,
    ): Promise<ProjectRoleSet> {
        const set = normalizeRoleSet(roleSet);
        const runner = async (trx: Knex.Transaction) => {
            const orgUuid = await this.getProjectOrganizationUuid(
                projectUuid,
                trx,
            );
            await this.validateCustomRoles(
                orgUuid,
                set.customRoleUuids,
                'project',
                trx,
            );
            const userId = await this.getOrganizationMemberUserId(
                orgUuid,
                userUuid,
                trx,
            );
            const projectId = await this.getProjectId(projectUuid, trx);
            const { slot, extraRoleUuids } = splitRoleSet(
                set,
                PROJECT_PLACEHOLDER_ROLE,
            );
            await trx(ProjectMembershipsTableName)
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    role: slot.role,
                    role_uuid: slot.roleUuid,
                })
                .onConflict(['project_id', 'user_id'])
                .merge(['role', 'role_uuid']);
            await replaceExtraRoles(
                trx,
                ProjectMembershipCustomRolesTableName,
                { project_id: projectId, user_id: userId },
                extraRoleUuids,
            );
            return this.getProjectUserRoleSet(projectUuid, userUuid, trx);
        };
        return this.runInTransaction(runner, tx);
    }

    /** Atomically replaces the group's project role set, creating access if needed. */
    async replaceProjectGroupRoleSet(
        projectUuid: string,
        groupUuid: string,
        roleSet: ProjectRoleSet,
        tx?: Knex.Transaction,
    ): Promise<ProjectRoleSet> {
        const set = normalizeRoleSet(roleSet);
        const runner = async (trx: Knex.Transaction) => {
            const orgUuid = await this.getProjectOrganizationUuid(
                projectUuid,
                trx,
            );
            await this.assertGroupInOrganization(groupUuid, orgUuid, trx);
            await this.validateCustomRoles(
                orgUuid,
                set.customRoleUuids,
                'project',
                trx,
            );
            const { slot, extraRoleUuids } = splitRoleSet(
                set,
                PROJECT_PLACEHOLDER_ROLE,
            );
            await trx(ProjectGroupAccessTableName)
                .insert({
                    project_uuid: projectUuid,
                    group_uuid: groupUuid,
                    role: slot.role,
                    role_uuid: slot.roleUuid,
                })
                .onConflict(['project_uuid', 'group_uuid'])
                .merge(['role', 'role_uuid']);
            await replaceExtraRoles(
                trx,
                ProjectGroupAccessCustomRolesTableName,
                { project_uuid: projectUuid, group_uuid: groupUuid },
                extraRoleUuids,
            );
            return this.getProjectGroupRoleSet(projectUuid, groupUuid, trx);
        };
        return this.runInTransaction(runner, tx);
    }

    private async runInTransaction<T>(
        runner: (trx: Knex.Transaction) => Promise<T>,
        tx?: Knex.Transaction,
    ): Promise<T> {
        if (tx) {
            return runner(tx);
        }
        return this.database.transaction(runner);
    }

    /**
     * Locks the organization's current admin rows and throws unless another
     * active admin (other than `excludingUserUuid`) remains. Call inside the
     * transaction that demotes/removes the user so concurrent demotions serialize.
     */
    async assertAnotherActiveAdmin(
        orgUuid: string,
        excludingUserUuid: string,
        trx: Knex.Transaction,
    ): Promise<void> {
        const orgId = await this.getOrganizationId(orgUuid, trx);
        const userId = await this.getUserId(excludingUserUuid, trx);
        await assertAnotherActiveAdminInOrganization(trx, orgId, userId);
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
     * Role-set analogue of `setUserOrgAndProjectRoles`: replaces the organization
     * role set and every listed project role set, and removes direct access to
     * projects not listed (preview projects excluded when requested).
     */
    async setUserOrgAndProjectRoleSets(
        organizationUuid: string,
        userUuid: string,
        orgRoleSet: OrganizationRoleSet,
        projectRoleSets: Array<{
            projectUuid: string;
            roleSet: ProjectRoleSet;
        }>,
        excludeProjectPreviews: boolean,
        tx?: Knex.Transaction,
    ): Promise<void> {
        await this.runInTransaction(async (trx) => {
            await this.replaceOrganizationUserRoleSet(
                organizationUuid,
                userUuid,
                orgRoleSet,
                trx,
            );
            const desired = new Map(
                projectRoleSets.map(({ projectUuid, roleSet }) => [
                    projectUuid,
                    roleSet,
                ]),
            );
            const current = await this.getUserProjectRoles(userUuid, trx);
            await Promise.all(
                current
                    .filter(
                        (membership) =>
                            !desired.has(membership.projectUuid) &&
                            !(
                                excludeProjectPreviews &&
                                membership.type === ProjectType.PREVIEW
                            ),
                    )
                    .map((membership) =>
                        this.removeUserProjectAccess(
                            userUuid,
                            membership.projectUuid,
                            trx,
                        ),
                    ),
            );
            for (const [projectUuid, roleSet] of desired.entries()) {
                // eslint-disable-next-line no-await-in-loop
                await this.replaceProjectUserRoleSet(
                    projectUuid,
                    userUuid,
                    roleSet,
                    trx,
                );
            }
        }, tx);
    }

    /**
     * Set a user's organization and project roles to exactly match the provided values.
     * - Organization role is REQUIRED and can be a system or custom organization role id.
     * - Project roles: adds or updates roles for listed projects; removes memberships for projects not present.
     * - If projectRoles is an empty array, all existing project memberships for the user are removed.
     * - If excludeProjectPreviews is true, preview projects are excluded from removal operations.
     * All operations are executed within a single transaction.
     */
    async setUserOrgAndProjectRoles(
        organizationUuid: string,
        userUuid: string,
        orgRoleId: string,
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
