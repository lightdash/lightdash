import {
    NotFoundError,
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
    type DirectAccessOrigin,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import { AppsTableName } from '../database/entities/apps';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    getDirectAccessGroupRolesForUsers,
    getDirectAccessList,
} from './directAccessAdminModelUtils';
import {
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    validateDirectAccessGroup,
    validateDirectAccessUser,
    type DirectAccess,
    type DirectAccessMutationContext,
    type DirectAccessMutationResult,
    type DirectAccessResetResult,
    type DirectAccessRow,
} from './directAccessModelUtils';

type AppMutationExpectation = {
    organizationUuid: string;
    projectUuid: string;
    spaceUuid: string | null;
};

const adminTableConfig = {
    userAccessTable: AppUserAccessTableName,
    groupAccessTable: AppGroupAccessTableName,
    resourceColumn: 'app_uuid',
};

export class AppAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
        expected: AppMutationExpectation,
    ): Promise<DirectAccessMutationContext> {
        const candidate = await trx(AppsTableName)
            .where('app_id', resourceUuid)
            .where('project_uuid', expected.projectUuid)
            .whereNull('deleted_at')
            .select<{ spaceUuid: string | null }>({ spaceUuid: 'space_uuid' })
            .first();
        if (
            candidate === undefined ||
            candidate.spaceUuid !== expected.spaceUuid
        ) {
            throw new NotFoundError('Direct access target not found');
        }

        const candidateProject = await trx(ProjectTableName)
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, expected.projectUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expected.organizationUuid,
            )
            .select<DirectAccessMutationContext>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .first();
        if (candidateProject === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const organization = await trx(OrganizationTableName)
            .where('organization_id', candidateProject.organizationId)
            .where('organization_uuid', expected.organizationUuid)
            .select<{ organizationId: number; organizationUuid: string }>({
                organizationId: 'organization_id',
                organizationUuid: 'organization_uuid',
            })
            .forNoKeyUpdate(OrganizationTableName)
            .first();
        const project = await trx(ProjectTableName)
            .where('project_id', candidateProject.projectId)
            .where('organization_id', candidateProject.organizationId)
            .where('project_uuid', expected.projectUuid)
            .select<{ projectId: number; projectUuid: string }>({
                projectId: 'project_id',
                projectUuid: 'project_uuid',
            })
            .forNoKeyUpdate(ProjectTableName)
            .first();
        if (organization === undefined || project === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        if (expected.spaceUuid !== null) {
            const space = await trx(SpaceTableName)
                .where('space_uuid', expected.spaceUuid)
                .where('project_id', project.projectId)
                .whereNull('deleted_at')
                .select('space_uuid')
                .forNoKeyUpdate(SpaceTableName)
                .first();
            if (space === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
        }

        const app = await trx(AppsTableName)
            .where('app_id', resourceUuid)
            .where('project_uuid', project.projectUuid)
            .whereNull('deleted_at')
            .select<{ spaceUuid: string | null }>({ spaceUuid: 'space_uuid' })
            .forUpdate(AppsTableName)
            .first();
        if (app === undefined || app.spaceUuid !== expected.spaceUuid) {
            throw new NotFoundError('Direct access target not found');
        }

        return {
            organizationId: organization.organizationId,
            organizationUuid: organization.organizationUuid,
            projectId: project.projectId,
            projectUuid: project.projectUuid,
        };
    }

    async upsertUserAccess({
        resourceUuid,
        userUuid,
        role,
        grantedByUserUuid,
        ...expected
    }: {
        resourceUuid: string;
        userUuid: string;
        role: SpaceMemberRole;
        grantedByUserUuid: string;
    } & AppMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await AppAccessModel.getMutationContext(
                trx,
                resourceUuid,
                expected,
            );
            if (!(await validateDirectAccessUser(trx, context, userUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(AppUserAccessTableName)
                .where({ app_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(AppUserAccessTableName)
                .insert({
                    app_uuid: resourceUuid,
                    user_uuid: userUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['app_uuid', 'user_uuid'])
                .merge({
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                    updated_at: trx.fn.now(),
                });
            return {
                ...context,
                beforeRole: existing?.space_role ?? null,
                afterRole: role,
            };
        });
    }

    async upsertGroupAccess({
        resourceUuid,
        groupUuid,
        role,
        grantedByUserUuid,
        ...expected
    }: {
        resourceUuid: string;
        groupUuid: string;
        role: SpaceMemberRole;
        grantedByUserUuid: string;
    } & AppMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await AppAccessModel.getMutationContext(
                trx,
                resourceUuid,
                expected,
            );
            if (!(await validateDirectAccessGroup(trx, context, groupUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(AppGroupAccessTableName)
                .where({ app_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(AppGroupAccessTableName)
                .insert({
                    app_uuid: resourceUuid,
                    group_uuid: groupUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['app_uuid', 'group_uuid'])
                .merge({
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                    updated_at: trx.fn.now(),
                });
            return {
                ...context,
                beforeRole: existing?.space_role ?? null,
                afterRole: role,
            };
        });
    }

    async revokeUserAccess({
        resourceUuid,
        userUuid,
        ...expected
    }: {
        resourceUuid: string;
        userUuid: string;
    } & AppMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await AppAccessModel.getMutationContext(
                trx,
                resourceUuid,
                expected,
            );
            const existing = await trx(AppUserAccessTableName)
                .where({ app_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(AppUserAccessTableName)
                .where({ app_uuid: resourceUuid, user_uuid: userUuid })
                .delete();
            return {
                ...context,
                beforeRole: existing.space_role,
                afterRole: null,
            };
        });
    }

    async revokeGroupAccess({
        resourceUuid,
        groupUuid,
        ...expected
    }: {
        resourceUuid: string;
        groupUuid: string;
    } & AppMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await AppAccessModel.getMutationContext(
                trx,
                resourceUuid,
                expected,
            );
            const existing = await trx(AppGroupAccessTableName)
                .where({ app_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(AppGroupAccessTableName)
                .where({ app_uuid: resourceUuid, group_uuid: groupUuid })
                .delete();
            return {
                ...context,
                beforeRole: existing.space_role,
                afterRole: null,
            };
        });
    }

    async resetAccess({
        resourceUuid,
        ...expected
    }: {
        resourceUuid: string;
    } & AppMutationExpectation): Promise<DirectAccessResetResult> {
        return this.database.transaction(async (trx) => {
            const context = await AppAccessModel.getMutationContext(
                trx,
                resourceUuid,
                expected,
            );
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(AppUserAccessTableName)
                    .where('app_uuid', resourceUuid)
                    .delete(),
                trx(AppGroupAccessTableName)
                    .where('app_uuid', resourceUuid)
                    .delete(),
            ]);
            return { ...context, revokedUsers, revokedGroups };
        });
    }

    async getDirectAccessList(
        resourceUuid: string,
        organizationUuid: string,
        projectUuid: string,
        options: {
            paginateArgs?: KnexPaginateArgs;
            searchQuery?: string;
            principal?: { origin: DirectAccessOrigin; uuid: string };
        } = {},
    ) {
        return getDirectAccessList(
            this.database,
            adminTableConfig,
            { resourceUuid, organizationUuid, projectUuid },
            options,
        );
    }

    async getGroupRolesForUsers(
        resourceUuid: string,
        organizationUuid: string,
        projectUuid: string,
        userUuids: string[],
    ): Promise<Record<string, SpaceMemberRole[]>> {
        return getDirectAccessGroupRolesForUsers(
            this.database,
            adminTableConfig,
            { resourceUuid, organizationUuid, projectUuid },
            userUuids,
        );
    }

    async getAdminRolesForUsers(
        organizationUuid: string,
        projectUuid: string,
        userUuids: string[],
    ): Promise<Record<string, SpaceMemberRole[]>> {
        if (userUuids.length === 0) return {};
        const projectMembers = this.database(ProjectMembershipsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${ProjectMembershipsTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_id`,
                `${ProjectMembershipsTableName}.user_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${ProjectMembershipsTableName}.role`,
                ProjectMemberRole.ADMIN,
            )
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .select<{ userUuid: string }[]>({
                userUuid: `${UserTableName}.user_uuid`,
            });
        const organizationMembers = this.database(
            OrganizationMembershipsTableName,
        )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${OrganizationMembershipsTableName}.organization_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_id`,
                `${OrganizationMembershipsTableName}.user_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${OrganizationMembershipsTableName}.role`,
                OrganizationMemberRole.ADMIN,
            )
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .select<{ userUuid: string }[]>({
                userUuid: `${UserTableName}.user_uuid`,
            });
        const groupMembers = this.database(ProjectGroupAccessTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${ProjectGroupAccessTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                GroupMembershipTableName,
                `${GroupMembershipTableName}.group_uuid`,
                `${ProjectGroupAccessTableName}.group_uuid`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_id`,
                `${GroupMembershipTableName}.user_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${ProjectGroupAccessTableName}.role`,
                ProjectMemberRole.ADMIN,
            )
            .where(
                `${GroupMembershipTableName}.organization_id`,
                this.database.ref(`${ProjectTableName}.organization_id`),
            )
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .select<{ userUuid: string }[]>({
                userUuid: `${UserTableName}.user_uuid`,
            });
        const rows = await projectMembers.union([
            organizationMembers,
            groupMembers,
        ]);
        return Object.fromEntries(
            rows.map(({ userUuid }) => [userUuid, [SpaceMemberRole.ADMIN]]),
        );
    }

    async getUserAccess(
        appUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
            includeDeleted = false,
        }: {
            trx?: Knex;
            organizationUuid: string;
            includeDeleted?: boolean;
        },
    ): Promise<Record<string, DirectAccess>> {
        const uniqueAppUuids = [...new Set(appUuids)];
        if (uniqueAppUuids.length === 0) {
            return {};
        }

        const joinAppProject = (join: Knex.JoinClause) => {
            join.on(
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            );
        };
        const joinAppSpace = (join: Knex.JoinClause) => {
            join.on(
                `${SpaceTableName}.space_uuid`,
                `${AppsTableName}.space_uuid`,
            ).andOn(
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            );
        };
        const whereAppLocationIsActive = (query: Knex.QueryBuilder) => {
            void query
                .whereNull(`${AppsTableName}.space_uuid`)
                .orWhere((spaceApp) => {
                    void spaceApp
                        .whereNotNull(`${SpaceTableName}.space_uuid`)
                        .whereNull(`${SpaceTableName}.deleted_at`);
                });
        };

        const rows: DirectAccessRow[] = await trx(AppUserAccessTableName)
            .select({
                resourceUuid: `${AppUserAccessTableName}.app_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${AppsTableName}.space_uuid`,
                role: `${AppUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppUserAccessTableName}.app_uuid`,
            )
            .innerJoin(ProjectTableName, joinAppProject)
            .leftJoin(SpaceTableName, joinAppSpace)
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AppUserAccessTableName}.user_uuid`,
            )
            .innerJoin(
                OrganizationMembershipsTableName,
                function joinCurrentOrganizationMembership() {
                    this.on(
                        `${OrganizationMembershipsTableName}.user_id`,
                        `${UserTableName}.user_id`,
                    ).andOn(
                        `${OrganizationMembershipsTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    );
                },
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .whereIn(`${AppUserAccessTableName}.app_uuid`, uniqueAppUuids)
            .where(`${AppUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .modify((query) => {
                if (!includeDeleted) {
                    void query.whereNull(`${AppsTableName}.deleted_at`);
                }
            })
            .where(whereAppLocationIsActive)
            .unionAll(
                trx(AppGroupAccessTableName)
                    .select({
                        resourceUuid: `${AppGroupAccessTableName}.app_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${AppsTableName}.space_uuid`,
                        role: `${AppGroupAccessTableName}.space_role`,
                        groupUuid: `${AppGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        AppsTableName,
                        `${AppsTableName}.app_id`,
                        `${AppGroupAccessTableName}.app_uuid`,
                    )
                    .innerJoin(ProjectTableName, joinAppProject)
                    .leftJoin(SpaceTableName, joinAppSpace)
                    .innerJoin(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    )
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${AppGroupAccessTableName}.group_uuid`,
                    )
                    .innerJoin(
                        UserTableName,
                        `${UserTableName}.user_id`,
                        `${GroupMembershipTableName}.user_id`,
                    )
                    .innerJoin(
                        OrganizationMembershipsTableName,
                        function joinCurrentOrganizationMembership() {
                            this.on(
                                `${OrganizationMembershipsTableName}.user_id`,
                                `${UserTableName}.user_id`,
                            ).andOn(
                                `${OrganizationMembershipsTableName}.organization_id`,
                                `${ProjectTableName}.organization_id`,
                            );
                        },
                    )
                    .whereIn(
                        `${AppGroupAccessTableName}.app_uuid`,
                        uniqueAppUuids,
                    )
                    .where(`${UserTableName}.user_uuid`, userUuid)
                    .where(
                        `${OrganizationTableName}.organization_uuid`,
                        organizationUuid,
                    )
                    .where(getActiveProjectMemberPredicate(trx))
                    .where(
                        `${GroupMembershipTableName}.organization_id`,
                        trx.ref(`${ProjectTableName}.organization_id`),
                    )
                    .where(
                        getActiveGrantedGroupPredicate(
                            trx,
                            AppGroupAccessTableName,
                        ),
                    )
                    .modify((query) => {
                        if (!includeDeleted) {
                            void query.whereNull(`${AppsTableName}.deleted_at`);
                        }
                    })
                    .where(whereAppLocationIsActive),
            );

        return groupDirectAccessRows(rows);
    }
}
