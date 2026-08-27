import {
    NotFoundError,
    ParameterError,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
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

type SavedChartOwnership = {
    spaceId: number | null;
    dashboardUuid: string | null;
};

type SavedChartMutationTarget = {
    context: DirectAccessMutationContext;
    ownership: SavedChartOwnership;
};

export const canReceiveSavedChartDirectAccess = ({
    spaceId,
    dashboardUuid,
}: SavedChartOwnership): boolean => spaceId !== null && dashboardUuid === null;

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

    private static async getMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<SavedChartMutationTarget> {
        // Discover optimistically, then lock parents before children to match
        // FK cascade order. The final chart lock/re-read rejects ownership races.
        const candidateChart = await trx(SavedChartsTableName)
            .where(`${SavedChartsTableName}.saved_query_uuid`, resourceUuid)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .select<
                SavedChartOwnership & {
                    storedProjectUuid: string;
                }
            >({
                spaceId: `${SavedChartsTableName}.space_id`,
                dashboardUuid: `${SavedChartsTableName}.dashboard_uuid`,
                storedProjectUuid: `${SavedChartsTableName}.project_uuid`,
            })
            .first();

        if (candidateChart === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        let ownerSpaceId = candidateChart.spaceId;
        if (ownerSpaceId === null) {
            if (candidateChart.dashboardUuid === null) {
                throw new NotFoundError('Direct access target not found');
            }
            const candidateDashboard = await trx(DashboardsTableName)
                .where('dashboard_uuid', candidateChart.dashboardUuid)
                .whereNull('deleted_at')
                .select<{ spaceId: number }>({ spaceId: 'space_id' })
                .first();
            if (candidateDashboard === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
            ownerSpaceId = candidateDashboard.spaceId;
        }

        const candidateOwner = await trx(SpaceTableName)
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
            .where(`${SpaceTableName}.space_id`, ownerSpaceId)
            .whereNull(`${SpaceTableName}.deleted_at`)
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
            .first();
        if (candidateOwner === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const organization = await trx(OrganizationTableName)
            .where('organization_id', candidateOwner.organizationId)
            .where('organization_uuid', expectedOrganizationUuid)
            .select<{ organizationId: number; organizationUuid: string }>({
                organizationId: 'organization_id',
                organizationUuid: 'organization_uuid',
            })
            .forNoKeyUpdate(OrganizationTableName)
            .first();
        if (organization === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const project = await trx(ProjectTableName)
            .where('project_id', candidateOwner.projectId)
            .where('organization_id', organization.organizationId)
            .select<{ projectId: number; projectUuid: string }>({
                projectId: 'project_id',
                projectUuid: 'project_uuid',
            })
            .forNoKeyUpdate(ProjectTableName)
            .first();
        if (project === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        const space = await trx(SpaceTableName)
            .where('space_id', ownerSpaceId)
            .where('project_id', project.projectId)
            .whereNull('deleted_at')
            .select('space_id')
            .forNoKeyUpdate(SpaceTableName)
            .first();
        if (space === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        if (
            candidateChart.spaceId === null &&
            candidateChart.dashboardUuid !== null
        ) {
            const dashboard = await trx(DashboardsTableName)
                .where('dashboard_uuid', candidateChart.dashboardUuid)
                .where('space_id', ownerSpaceId)
                .where('project_uuid', project.projectUuid)
                .whereNull('deleted_at')
                .select('dashboard_uuid')
                .forNoKeyUpdate(DashboardsTableName)
                .first();
            if (dashboard === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
        }

        const chart = await trx(SavedChartsTableName)
            .where('saved_query_uuid', resourceUuid)
            .whereNull('deleted_at')
            .select<
                SavedChartOwnership & {
                    storedProjectUuid: string;
                }
            >({
                spaceId: 'space_id',
                dashboardUuid: 'dashboard_uuid',
                storedProjectUuid: 'project_uuid',
            })
            .forUpdate(SavedChartsTableName)
            .first();
        if (
            chart === undefined ||
            chart.spaceId !== candidateChart.spaceId ||
            chart.dashboardUuid !== candidateChart.dashboardUuid ||
            chart.storedProjectUuid !== project.projectUuid
        ) {
            throw new NotFoundError('Direct access target not found');
        }

        return {
            context: {
                organizationId: organization.organizationId,
                organizationUuid: organization.organizationUuid,
                projectId: project.projectId,
                projectUuid: project.projectUuid,
            },
            ownership: {
                spaceId: chart.spaceId,
                dashboardUuid: chart.dashboardUuid,
            },
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
            const { context, ownership } =
                await SavedChartAccessModel.getMutationTarget(
                    trx,
                    resourceUuid,
                    organizationUuid,
                );
            if (!canReceiveSavedChartDirectAccess(ownership)) {
                throw new ParameterError(
                    'Cannot grant direct access to a dashboard-owned chart; grant access to its dashboard instead',
                );
            }
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
            const { context, ownership } =
                await SavedChartAccessModel.getMutationTarget(
                    trx,
                    resourceUuid,
                    organizationUuid,
                );
            if (!canReceiveSavedChartDirectAccess(ownership)) {
                throw new ParameterError(
                    'Cannot grant direct access to a dashboard-owned chart; grant access to its dashboard instead',
                );
            }
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

    // Revokes are idempotent so stale grants can be removed after ownership
    // changes, including when a chart becomes dashboard-owned.
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
            const { context } = await SavedChartAccessModel.getMutationTarget(
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
            const { context } = await SavedChartAccessModel.getMutationTarget(
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
            const { context } = await SavedChartAccessModel.getMutationTarget(
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
            .where(
                `${SavedChartsTableName}.project_uuid`,
                trx.ref(`${ProjectTableName}.project_uuid`),
            )
            .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
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
                    .where(
                        `${SavedChartsTableName}.project_uuid`,
                        trx.ref(`${ProjectTableName}.project_uuid`),
                    )
                    .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
                    .whereNull(`${SavedChartsTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
