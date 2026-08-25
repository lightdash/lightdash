import {
    DirectAccessOrigin,
    NotFoundError,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import { DashboardsTableName } from '../database/entities/dashboards';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import KnexPaginate from '../database/pagination';
import {
    assertCanGrantDirectAccess,
    assertCanResetDirectAccess,
    assertCanRevokeDirectAccess,
    getActiveGrantedGroupPredicate,
    getActiveProjectMemberPredicate,
    groupDirectAccessRows,
    validateDirectAccessGroup,
    validateDirectAccessUser,
    type DirectAccess,
    type DirectAccessModel,
    type DirectAccessModelActorRoleResolver,
    type DirectAccessMutationContext,
    type DirectAccessMutationResult,
    type DirectAccessResetResult,
    type DirectAccessRow,
} from './directAccessModelUtils';
import { getColumnMatchRegexQuery } from './SearchModel/utils/search';

export type DashboardDirectAccess = DirectAccess;

export type DashboardDirectAccessListRow =
    | {
          origin: DirectAccessOrigin.USER;
          principalUuid: string;
          firstName: string;
          lastName: string;
          email: string;
          isInternal: boolean;
          name: null;
          directRole: SpaceMemberRole;
      }
    | {
          origin: DirectAccessOrigin.GROUP;
          principalUuid: string;
          firstName: null;
          lastName: null;
          email: null;
          isInternal: null;
          name: string;
          directRole: SpaceMemberRole;
      };

export class DashboardAccessModel implements DirectAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationContext> {
        const context = await trx(DashboardsTableName)
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${DashboardsTableName}.dashboard_uuid`, resourceUuid)
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<DirectAccessMutationContext>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .forUpdate(DashboardsTableName)
            .first();

        if (context === undefined) {
            throw new NotFoundError('Direct access target not found');
        }
        return context;
    }

    async upsertUserAccess({
        resourceUuid,
        userUuid,
        role,
        actorRole: preflightActorRole,
        actorRoleResolver,
        organizationUuid,
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(preflightActorRole, role);
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const actorRole = await actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanGrantDirectAccess(actorRole, role);
            if (!(await validateDirectAccessUser(trx, context, userUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(DashboardUserAccessTableName)
                .where({ dashboard_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: grantedByUserUuid === userUuid,
            });
            await trx(DashboardUserAccessTableName)
                .insert({
                    dashboard_uuid: resourceUuid,
                    user_uuid: userUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['dashboard_uuid', 'user_uuid'])
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
        actorRole: preflightActorRole,
        actorRoleResolver,
        organizationUuid,
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(preflightActorRole, role);
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const actorRole = await actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanGrantDirectAccess(actorRole, role);
            if (!(await validateDirectAccessGroup(trx, context, groupUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(DashboardGroupAccessTableName)
                .where({ dashboard_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: false,
            });
            await trx(DashboardGroupAccessTableName)
                .insert({
                    dashboard_uuid: resourceUuid,
                    group_uuid: groupUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['dashboard_uuid', 'group_uuid'])
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
        actorRole: preflightActorRole,
        actorRoleResolver,
        organizationUuid,
        actorUserUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
        actorUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        const isSelfRevoke = actorUserUuid === userUuid;
        assertCanRevokeDirectAccess({
            actorRole: preflightActorRole,
            isSelfRevoke,
        });
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const actorRole = await actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(DashboardUserAccessTableName)
                .where({ dashboard_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                assertCanRevokeDirectAccess({
                    actorRole,
                    isSelfRevoke,
                });
                return {
                    ...context,
                    beforeRole: null,
                    afterRole: null,
                };
            }
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing.space_role,
                isSelfRevoke,
            });
            await trx(DashboardUserAccessTableName)
                .where({ dashboard_uuid: resourceUuid, user_uuid: userUuid })
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
        actorRole: preflightActorRole,
        actorRoleResolver,
        organizationUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanRevokeDirectAccess({
            actorRole: preflightActorRole,
            isSelfRevoke: false,
        });
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const actorRole = await actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(DashboardGroupAccessTableName)
                .where({ dashboard_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                assertCanRevokeDirectAccess({
                    actorRole,
                    isSelfRevoke: false,
                });
                return {
                    ...context,
                    beforeRole: null,
                    afterRole: null,
                };
            }
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing.space_role,
                isSelfRevoke: false,
            });
            await trx(DashboardGroupAccessTableName)
                .where({ dashboard_uuid: resourceUuid, group_uuid: groupUuid })
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
        actorRole: preflightActorRole,
        actorRoleResolver,
        organizationUuid,
    }: {
        resourceUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
    }): Promise<DirectAccessResetResult> {
        assertCanResetDirectAccess(preflightActorRole);
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const actorRole = await actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanResetDirectAccess(actorRole);
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(DashboardUserAccessTableName)
                    .where('dashboard_uuid', resourceUuid)
                    .delete(),
                trx(DashboardGroupAccessTableName)
                    .where('dashboard_uuid', resourceUuid)
                    .delete(),
            ]);
            return { ...context, revokedUsers, revokedGroups };
        });
    }

    async getDirectAccessList(
        dashboardUuid: string,
        organizationUuid: string,
        {
            paginateArgs,
            searchQuery,
            principal,
        }: {
            paginateArgs?: KnexPaginateArgs;
            searchQuery?: string;
            principal?: {
                origin: DirectAccessOrigin;
                uuid: string;
            };
        } = {},
    ): Promise<KnexPaginatedData<DashboardDirectAccessListRow[]>> {
        const users = this.database(DashboardUserAccessTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardUserAccessTableName}.dashboard_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardUserAccessTableName}.user_uuid`,
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
            .leftJoin(EmailTableName, function joinPrimaryEmail() {
                this.on(
                    `${EmailTableName}.user_id`,
                    `${UserTableName}.user_id`,
                ).andOnVal(`${EmailTableName}.is_primary`, true);
            })
            .where(
                `${DashboardUserAccessTableName}.dashboard_uuid`,
                dashboardUuid,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .where(getActiveProjectMemberPredicate(this.database))
            .select({
                origin: this.database.raw('?', [DirectAccessOrigin.USER]),
                principalUuid: `${DashboardUserAccessTableName}.user_uuid`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                email: this.database.raw('COALESCE(??, ?)', [
                    `${EmailTableName}.email`,
                    '',
                ]),
                isInternal: `${UserTableName}.is_internal`,
                name: this.database.raw('NULL::text'),
                directRole: `${DashboardUserAccessTableName}.space_role`,
            });

        const groups = this.database(DashboardGroupAccessTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardGroupAccessTableName}.dashboard_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(GroupTableName, function joinSourceOrganizationGroup() {
                this.on(
                    `${GroupTableName}.group_uuid`,
                    `${DashboardGroupAccessTableName}.group_uuid`,
                ).andOn(
                    `${GroupTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                );
            })
            .where(
                `${DashboardGroupAccessTableName}.dashboard_uuid`,
                dashboardUuid,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .where(
                getActiveGrantedGroupPredicate(
                    this.database,
                    DashboardGroupAccessTableName,
                ),
            )
            .select({
                origin: this.database.raw('?', [DirectAccessOrigin.GROUP]),
                principalUuid: `${DashboardGroupAccessTableName}.group_uuid`,
                firstName: this.database.raw('NULL::text'),
                lastName: this.database.raw('NULL::text'),
                email: this.database.raw('NULL::text'),
                isInternal: this.database.raw('NULL::boolean'),
                name: `${GroupTableName}.name`,
                directRole: `${DashboardGroupAccessTableName}.space_role`,
            });

        let query = this.database
            .select<DashboardDirectAccessListRow[]>('*')
            .from(users.unionAll(groups).as('dashboard_direct_access'));

        if (searchQuery) {
            query = getColumnMatchRegexQuery(query, searchQuery, [
                'firstName',
                'lastName',
                'email',
                'name',
            ]);
        }
        if (principal) {
            void query
                .where('origin', principal.origin)
                .where('principalUuid', principal.uuid);
        }
        void query
            .orderByRaw('LOWER(COALESCE(??, ??, ?))', ['name', 'firstName', ''])
            .orderBy('origin')
            .orderBy('principalUuid');

        return KnexPaginate.paginate(query, paginateArgs);
    }

    async getGroupRolesForUsers(
        dashboardUuid: string,
        userUuids: string[],
        organizationUuid: string,
    ): Promise<Record<string, SpaceMemberRole[]>> {
        if (userUuids.length === 0) {
            return {};
        }

        const rows = await this.database(DashboardGroupAccessTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardGroupAccessTableName}.dashboard_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                GroupMembershipTableName,
                `${GroupMembershipTableName}.group_uuid`,
                `${DashboardGroupAccessTableName}.group_uuid`,
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
            .where(
                `${DashboardGroupAccessTableName}.dashboard_uuid`,
                dashboardUuid,
            )
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${GroupMembershipTableName}.organization_id`,
                this.database.ref(`${ProjectTableName}.organization_id`),
            )
            .where(getActiveProjectMemberPredicate(this.database))
            .where(
                getActiveGrantedGroupPredicate(
                    this.database,
                    DashboardGroupAccessTableName,
                ),
            )
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .select<{ userUuid: string; role: SpaceMemberRole }[]>(
                `${UserTableName}.user_uuid as userUuid`,
                `${DashboardGroupAccessTableName}.space_role as role`,
            );

        const rolesByUserUuid: Record<string, SpaceMemberRole[]> = {};
        for (const { userUuid, role } of rows) {
            rolesByUserUuid[userUuid] = [
                ...(rolesByUserUuid[userUuid] ?? []),
                role,
            ];
        }
        return rolesByUserUuid;
    }

    async getUserAccess(
        dashboardUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
        }: {
            trx?: Knex;
            organizationUuid: string;
        },
    ): Promise<Record<string, DashboardDirectAccess>> {
        const uniqueDashboardUuids = [...new Set(dashboardUuids)];
        if (uniqueDashboardUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(DashboardUserAccessTableName)
            .select({
                resourceUuid: `${DashboardUserAccessTableName}.dashboard_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${DashboardUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardUserAccessTableName}.dashboard_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardUserAccessTableName}.user_uuid`,
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
            .whereIn(
                `${DashboardUserAccessTableName}.dashboard_uuid`,
                uniqueDashboardUuids,
            )
            .where(`${DashboardUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .unionAll(
                trx(DashboardGroupAccessTableName)
                    .select({
                        resourceUuid: `${DashboardGroupAccessTableName}.dashboard_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${DashboardGroupAccessTableName}.space_role`,
                        groupUuid: `${DashboardGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        DashboardsTableName,
                        `${DashboardsTableName}.dashboard_uuid`,
                        `${DashboardGroupAccessTableName}.dashboard_uuid`,
                    )
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_id`,
                        `${DashboardsTableName}.space_id`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_id`,
                        `${SpaceTableName}.project_id`,
                    )
                    .innerJoin(
                        OrganizationTableName,
                        `${OrganizationTableName}.organization_id`,
                        `${ProjectTableName}.organization_id`,
                    )
                    .innerJoin(
                        GroupMembershipTableName,
                        `${GroupMembershipTableName}.group_uuid`,
                        `${DashboardGroupAccessTableName}.group_uuid`,
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
                        `${DashboardGroupAccessTableName}.dashboard_uuid`,
                        uniqueDashboardUuids,
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
                            DashboardGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${DashboardsTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
