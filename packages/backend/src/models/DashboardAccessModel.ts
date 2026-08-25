import { NotFoundError, type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
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

export type DashboardDirectAccess = DirectAccess;

export class DashboardAccessModel implements DirectAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
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
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(preflightActorRole, role);
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
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
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(preflightActorRole, role);
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
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
        actorUserUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
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
                throw new NotFoundError('Direct access target not found');
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
    }: {
        resourceUuid: string;
        groupUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
    }): Promise<DirectAccessMutationResult> {
        assertCanRevokeDirectAccess({
            actorRole: preflightActorRole,
            isSelfRevoke: false,
        });
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
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
                throw new NotFoundError('Direct access target not found');
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
    }: {
        resourceUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
    }): Promise<DirectAccessResetResult> {
        assertCanResetDirectAccess(preflightActorRole);
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
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

    async getUserAccess(
        dashboardUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
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
