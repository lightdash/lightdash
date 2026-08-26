import {
    NotFoundError,
    ParameterError,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import { SavedChartsTableName } from '../database/entities/savedCharts';
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

export type SavedChartDirectAccess = DirectAccess;

/**
 * Pure data access for saved (explore) chart direct grants. Mirrors
 * DashboardAccessModel: authorization (CASL, role delegation) is the calling
 * service's responsibility; the model enforces tenant safety only —
 * organization scoping and current-membership checks. Only space-saved charts
 * carry grants; the space join excludes dashboard-owned definitions
 * (`saved_queries.space_id` null).
 */
export class SavedChartAccessModel {
    constructor(private readonly database: Knex) {}

    /**
     * Locks the target space-saved chart and returns its tenant context.
     * SPK-1450: a dashboard-owned chart (space_id null / dashboard_uuid set)
     * inherits access through its dashboard, so a direct chart grant is
     * refused — the boundary keeps one chart from carrying two grant sources.
     */
    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationContext> {
        const chart = await trx(SavedChartsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${SavedChartsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${SavedChartsTableName}.saved_query_uuid`, resourceUuid)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                expectedOrganizationUuid,
            )
            .select<
                DirectAccessMutationContext & {
                    spaceId: number | null;
                    dashboardUuid: string | null;
                }
            >({
                spaceId: `${SavedChartsTableName}.space_id`,
                dashboardUuid: `${SavedChartsTableName}.dashboard_uuid`,
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .forUpdate(SavedChartsTableName)
            .first();

        if (chart === undefined) {
            throw new NotFoundError('Direct access target not found');
        }
        if (chart.dashboardUuid !== null || chart.spaceId === null) {
            throw new ParameterError(
                'Cannot grant direct access to a dashboard-owned chart; grant access to its dashboard instead',
            );
        }
        return {
            organizationId: chart.organizationId,
            organizationUuid: chart.organizationUuid,
            projectId: chart.projectId,
            projectUuid: chart.projectUuid,
        };
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
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            if (!(await validateDirectAccessUser(trx, context, userUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedChartUserAccessTableName)
                .where({ saved_chart_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(SavedChartUserAccessTableName)
                .insert({
                    saved_chart_uuid: resourceUuid,
                    user_uuid: userUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['saved_chart_uuid', 'user_uuid'])
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
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            if (!(await validateDirectAccessGroup(trx, context, groupUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedChartGroupAccessTableName)
                .where({
                    saved_chart_uuid: resourceUuid,
                    group_uuid: groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(SavedChartGroupAccessTableName)
                .insert({
                    saved_chart_uuid: resourceUuid,
                    group_uuid: groupUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['saved_chart_uuid', 'group_uuid'])
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

    // Revokes are idempotent: revoking a grant that does not exist succeeds as
    // a no-op ({ beforeRole: null, afterRole: null }). A missing, cross-org, or
    // dashboard-owned chart still fails (NotFoundError / ParameterError).
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
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const existing = await trx(SavedChartUserAccessTableName)
                .where({ saved_chart_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(SavedChartUserAccessTableName)
                .where({ saved_chart_uuid: resourceUuid, user_uuid: userUuid })
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
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const existing = await trx(SavedChartGroupAccessTableName)
                .where({
                    saved_chart_uuid: resourceUuid,
                    group_uuid: groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(SavedChartGroupAccessTableName)
                .where({
                    saved_chart_uuid: resourceUuid,
                    group_uuid: groupUuid,
                })
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
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                resourceUuid,
                organizationUuid,
            );
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(SavedChartUserAccessTableName)
                    .where('saved_chart_uuid', resourceUuid)
                    .delete(),
                trx(SavedChartGroupAccessTableName)
                    .where('saved_chart_uuid', resourceUuid)
                    .delete(),
            ]);
            return { ...context, revokedUsers, revokedGroups };
        });
    }

    async getUserAccess(
        savedChartUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
        }: {
            trx?: Knex;
            organizationUuid: string;
        },
    ): Promise<Record<string, SavedChartDirectAccess>> {
        const uniqueUuids = [...new Set(savedChartUuids)];
        if (uniqueUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedChartUserAccessTableName)
            .select({
                resourceUuid: `${SavedChartUserAccessTableName}.saved_chart_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                role: `${SavedChartUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartUserAccessTableName}.saved_chart_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${SavedChartsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SavedChartUserAccessTableName}.user_uuid`,
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
                `${SavedChartUserAccessTableName}.saved_chart_uuid`,
                uniqueUuids,
            )
            .where(`${SavedChartUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .unionAll(
                trx(SavedChartGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        role: `${SavedChartGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedChartGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedChartsTableName,
                        `${SavedChartsTableName}.saved_query_uuid`,
                        `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                    )
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_id`,
                        `${SavedChartsTableName}.space_id`,
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
                        `${SavedChartGroupAccessTableName}.group_uuid`,
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
                        `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                        uniqueUuids,
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
                            SavedChartGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${SavedChartsTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
