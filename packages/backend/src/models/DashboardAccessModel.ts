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

export type DashboardDirectAccess = DirectAccess;

/**
 * Pure data access for dashboard direct grants. Authorization (CASL, role
 * delegation) is the calling service's responsibility; the model enforces
 * tenant safety only: organization scoping and current-membership checks.
 */
export class DashboardAccessModel {
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
        organizationUuid,
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        role: SpaceMemberRole;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            if (!(await validateDirectAccessUser(trx, context, userUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(DashboardUserAccessTableName)
                .where({ dashboard_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
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
        organizationUuid,
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
        role: SpaceMemberRole;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            if (!(await validateDirectAccessGroup(trx, context, groupUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(DashboardGroupAccessTableName)
                .where({ dashboard_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
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

    // Revokes are idempotent: revoking a grant that does not exist succeeds
    // as a no-op ({ beforeRole: null, afterRole: null }). A missing or
    // cross-organization dashboard still fails with NotFoundError.
    async revokeUserAccess({
        resourceUuid,
        userUuid,
        organizationUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        organizationUuid: string;
    }): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const existing = await trx(DashboardUserAccessTableName)
                .where({ dashboard_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
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
        organizationUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
        organizationUuid: string;
    }): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const existing = await trx(DashboardGroupAccessTableName)
                .where({ dashboard_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
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
        organizationUuid,
    }: {
        resourceUuid: string;
        organizationUuid: string;
    }): Promise<DirectAccessResetResult> {
        return this.database.transaction(async (trx) => {
            const context = await DashboardAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
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
                spaceUuid: `${SpaceTableName}.space_uuid`,
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
                        spaceUuid: `${SpaceTableName}.space_uuid`,
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
