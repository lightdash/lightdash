import {
    NotFoundError,
    ParameterError,
    type DirectAccessOrigin,
    type KnexPaginateArgs,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
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

export type SavedSqlDirectAccess = DirectAccess;

type SavedSqlOwnership = {
    spaceUuid: string | null;
    dashboardUuid: string | null;
};

type SavedSqlMutationTarget = {
    context: DirectAccessMutationContext;
    ownership: SavedSqlOwnership;
};

export type SavedSqlMutationExpectation = SavedSqlOwnership & {
    organizationUuid: string;
    projectUuid: string;
};

export const canReceiveSavedSqlDirectAccess = ({
    spaceUuid,
    dashboardUuid,
}: SavedSqlOwnership): boolean => spaceUuid !== null && dashboardUuid === null;

const adminTableConfig = {
    userAccessTable: SavedSqlUserAccessTableName,
    groupAccessTable: SavedSqlGroupAccessTableName,
    resourceColumn: 'saved_sql_uuid',
};

export class SavedSqlAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expected: SavedSqlMutationExpectation,
    ): Promise<SavedSqlMutationTarget> {
        const candidateChart = await trx(SavedSqlTableName)
            .where(`${SavedSqlTableName}.saved_sql_uuid`, resourceUuid)
            .where(`${SavedSqlTableName}.project_uuid`, expected.projectUuid)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .select<SavedSqlOwnership>({
                spaceUuid: `${SavedSqlTableName}.space_uuid`,
                dashboardUuid: `${SavedSqlTableName}.dashboard_uuid`,
            })
            .first();
        if (candidateChart === undefined) {
            throw new NotFoundError('Direct access target not found');
        }

        let ownerSpaceId: number;
        if (candidateChart.spaceUuid !== null) {
            const candidateSpace = await trx(SpaceTableName)
                .where('space_uuid', candidateChart.spaceUuid)
                .whereNull('deleted_at')
                .select<{ spaceId: number }>({ spaceId: 'space_id' })
                .first();
            if (candidateSpace === undefined) {
                throw new NotFoundError('Direct access target not found');
            }
            ownerSpaceId = candidateSpace.spaceId;
        } else {
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
                expected.organizationUuid,
            )
            .where(`${ProjectTableName}.project_uuid`, expected.projectUuid)
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
            .where('organization_uuid', expected.organizationUuid)
            .select<{ organizationId: number; organizationUuid: string }>({
                organizationId: 'organization_id',
                organizationUuid: 'organization_uuid',
            })
            .forNoKeyUpdate(OrganizationTableName)
            .first();
        const project = await trx(ProjectTableName)
            .where('project_id', candidateOwner.projectId)
            .where('organization_id', candidateOwner.organizationId)
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
        const space = await trx(SpaceTableName)
            .where('space_id', ownerSpaceId)
            .where('project_id', project.projectId)
            .whereNull('deleted_at')
            .select<{ spaceUuid: string }>({ spaceUuid: 'space_uuid' })
            .forNoKeyUpdate(SpaceTableName)
            .first();
        if (space === undefined) {
            throw new NotFoundError('Direct access target not found');
        }
        if (candidateChart.dashboardUuid !== null) {
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

        const chart = await trx(SavedSqlTableName)
            .where('saved_sql_uuid', resourceUuid)
            .whereNull('deleted_at')
            .select<SavedSqlOwnership & { projectUuid: string }>({
                spaceUuid: 'space_uuid',
                dashboardUuid: 'dashboard_uuid',
                projectUuid: 'project_uuid',
            })
            .forUpdate(SavedSqlTableName)
            .first();
        if (
            chart === undefined ||
            chart.spaceUuid !== expected.spaceUuid ||
            chart.dashboardUuid !== expected.dashboardUuid ||
            chart.spaceUuid !== candidateChart.spaceUuid ||
            chart.dashboardUuid !== candidateChart.dashboardUuid ||
            chart.projectUuid !== project.projectUuid ||
            (chart.spaceUuid !== null && chart.spaceUuid !== space.spaceUuid)
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
                spaceUuid: chart.spaceUuid,
                dashboardUuid: chart.dashboardUuid,
            },
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
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context, ownership } =
                await SavedSqlAccessModel.getMutationTarget(
                    trx,
                    resourceUuid,
                    expected,
                );
            if (!canReceiveSavedSqlDirectAccess(ownership)) {
                throw new ParameterError(
                    'Cannot grant direct access to a dashboard-owned SQL chart; grant access to its dashboard instead',
                );
            }
            if (!(await validateDirectAccessUser(trx, context, userUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedSqlUserAccessTableName)
                .where({ saved_sql_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(SavedSqlUserAccessTableName)
                .insert({
                    saved_sql_uuid: resourceUuid,
                    user_uuid: userUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['saved_sql_uuid', 'user_uuid'])
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
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context, ownership } =
                await SavedSqlAccessModel.getMutationTarget(
                    trx,
                    resourceUuid,
                    expected,
                );
            if (!canReceiveSavedSqlDirectAccess(ownership)) {
                throw new ParameterError(
                    'Cannot grant direct access to a dashboard-owned SQL chart; grant access to its dashboard instead',
                );
            }
            if (!(await validateDirectAccessGroup(trx, context, groupUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedSqlGroupAccessTableName)
                .where({ saved_sql_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            await trx(SavedSqlGroupAccessTableName)
                .insert({
                    saved_sql_uuid: resourceUuid,
                    group_uuid: groupUuid,
                    space_role: role,
                    granted_by_user_uuid: grantedByUserUuid,
                })
                .onConflict(['saved_sql_uuid', 'group_uuid'])
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
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await SavedSqlAccessModel.getMutationTarget(
                trx,
                resourceUuid,
                expected,
            );
            const existing = await trx(SavedSqlUserAccessTableName)
                .where({ saved_sql_uuid: resourceUuid, user_uuid: userUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(SavedSqlUserAccessTableName)
                .where({ saved_sql_uuid: resourceUuid, user_uuid: userUuid })
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
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await SavedSqlAccessModel.getMutationTarget(
                trx,
                resourceUuid,
                expected,
            );
            const existing = await trx(SavedSqlGroupAccessTableName)
                .where({ saved_sql_uuid: resourceUuid, group_uuid: groupUuid })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(SavedSqlGroupAccessTableName)
                .where({ saved_sql_uuid: resourceUuid, group_uuid: groupUuid })
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
    } & SavedSqlMutationExpectation): Promise<DirectAccessResetResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await SavedSqlAccessModel.getMutationTarget(
                trx,
                resourceUuid,
                expected,
            );
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(SavedSqlUserAccessTableName)
                    .where('saved_sql_uuid', resourceUuid)
                    .delete(),
                trx(SavedSqlGroupAccessTableName)
                    .where('saved_sql_uuid', resourceUuid)
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

    async getUserAccess(
        savedSqlUuids: string[],
        userUuid: string,
        {
            trx = this.database,
            organizationUuid,
        }: {
            trx?: Knex;
            organizationUuid: string;
        },
    ): Promise<Record<string, SavedSqlDirectAccess>> {
        const uniqueUuids = [...new Set(savedSqlUuids)];
        if (uniqueUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedSqlUserAccessTableName)
            .select({
                resourceUuid: `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                role: `${SavedSqlUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedSqlTableName,
                `${SavedSqlTableName}.saved_sql_uuid`,
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_uuid`,
                `${SavedSqlTableName}.space_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .innerJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SavedSqlUserAccessTableName}.user_uuid`,
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
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                uniqueUuids,
            )
            .where(`${SavedSqlUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .where(
                `${SavedSqlTableName}.project_uuid`,
                trx.ref(`${ProjectTableName}.project_uuid`),
            )
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .unionAll(
                trx(SavedSqlGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        spaceUuid: `${SpaceTableName}.space_uuid`,
                        role: `${SavedSqlGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedSqlGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedSqlTableName,
                        `${SavedSqlTableName}.saved_sql_uuid`,
                        `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                    )
                    .innerJoin(
                        SpaceTableName,
                        `${SpaceTableName}.space_uuid`,
                        `${SavedSqlTableName}.space_uuid`,
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
                        `${SavedSqlGroupAccessTableName}.group_uuid`,
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
                        `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
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
                            SavedSqlGroupAccessTableName,
                        ),
                    )
                    .where(
                        `${SavedSqlTableName}.project_uuid`,
                        trx.ref(`${ProjectTableName}.project_uuid`),
                    )
                    .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
                    .whereNull(`${SavedSqlTableName}.deleted_at`)
                    .whereNull(`${SpaceTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
