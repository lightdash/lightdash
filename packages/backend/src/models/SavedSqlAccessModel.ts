import {
    DirectAccessOrigin,
    NotFoundError,
    ParameterError,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { EmailTableName } from '../database/entities/emails';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
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
import KnexPaginate from '../database/pagination';
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
import { getColumnMatchRegexQuery } from './SearchModel/utils/search';

export type SavedSqlDirectAccess = DirectAccess;

export type SavedSqlDirectAccessListRow =
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

export class SavedSqlAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationTarget(
        trx: Knex,
        resourceUuid: string,
        expected: SavedSqlMutationExpectation,
    ): Promise<SavedSqlMutationTarget> {
        // Discover optimistically, then lock parents before children to match
        // FK cascade order. The final SQL-chart re-read rejects ownership races.
        const candidateChart = await trx(SavedSqlTableName)
            .where(`${SavedSqlTableName}.saved_sql_uuid`, resourceUuid)
            .where(`${SavedSqlTableName}.project_uuid`, expected.projectUuid)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .select<
                SavedSqlOwnership & {
                    storedProjectUuid: string;
                }
            >({
                spaceUuid: `${SavedSqlTableName}.space_uuid`,
                dashboardUuid: `${SavedSqlTableName}.dashboard_uuid`,
                storedProjectUuid: `${SavedSqlTableName}.project_uuid`,
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
            .select<
                SavedSqlOwnership & {
                    storedProjectUuid: string;
                }
            >({
                spaceUuid: 'space_uuid',
                dashboardUuid: 'dashboard_uuid',
                storedProjectUuid: 'project_uuid',
            })
            .forUpdate(SavedSqlTableName)
            .first();
        if (
            chart === undefined ||
            chart.spaceUuid !== expected.spaceUuid ||
            chart.dashboardUuid !== expected.dashboardUuid ||
            chart.spaceUuid !== candidateChart.spaceUuid ||
            chart.dashboardUuid !== candidateChart.dashboardUuid ||
            chart.storedProjectUuid !== project.projectUuid ||
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
        organizationUuid,
        projectUuid,
        spaceUuid,
        dashboardUuid,
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
        role: SpaceMemberRole;
        grantedByUserUuid: string;
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context, ownership } =
                await SavedSqlAccessModel.getMutationTarget(trx, resourceUuid, {
                    organizationUuid,
                    projectUuid,
                    spaceUuid,
                    dashboardUuid,
                });
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
        organizationUuid,
        projectUuid,
        spaceUuid,
        dashboardUuid,
        grantedByUserUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
        role: SpaceMemberRole;
        grantedByUserUuid: string;
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context, ownership } =
                await SavedSqlAccessModel.getMutationTarget(trx, resourceUuid, {
                    organizationUuid,
                    projectUuid,
                    spaceUuid,
                    dashboardUuid,
                });
            if (!canReceiveSavedSqlDirectAccess(ownership)) {
                throw new ParameterError(
                    'Cannot grant direct access to a dashboard-owned SQL chart; grant access to its dashboard instead',
                );
            }
            if (!(await validateDirectAccessGroup(trx, context, groupUuid))) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedSqlGroupAccessTableName)
                .where({
                    saved_sql_uuid: resourceUuid,
                    group_uuid: groupUuid,
                })
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
        organizationUuid,
        projectUuid,
        spaceUuid,
        dashboardUuid,
    }: {
        resourceUuid: string;
        userUuid: string;
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await SavedSqlAccessModel.getMutationTarget(
                trx,
                resourceUuid,
                {
                    organizationUuid,
                    projectUuid,
                    spaceUuid,
                    dashboardUuid,
                },
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
        organizationUuid,
        projectUuid,
        spaceUuid,
        dashboardUuid,
    }: {
        resourceUuid: string;
        groupUuid: string;
    } & SavedSqlMutationExpectation): Promise<DirectAccessMutationResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await SavedSqlAccessModel.getMutationTarget(
                trx,
                resourceUuid,
                {
                    organizationUuid,
                    projectUuid,
                    spaceUuid,
                    dashboardUuid,
                },
            );
            const existing = await trx(SavedSqlGroupAccessTableName)
                .where({
                    saved_sql_uuid: resourceUuid,
                    group_uuid: groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            if (existing === undefined) {
                return { ...context, beforeRole: null, afterRole: null };
            }
            await trx(SavedSqlGroupAccessTableName)
                .where({
                    saved_sql_uuid: resourceUuid,
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
        projectUuid,
        spaceUuid,
        dashboardUuid,
    }: {
        resourceUuid: string;
    } & SavedSqlMutationExpectation): Promise<DirectAccessResetResult> {
        return this.database.transaction(async (trx) => {
            const { context } = await SavedSqlAccessModel.getMutationTarget(
                trx,
                resourceUuid,
                {
                    organizationUuid,
                    projectUuid,
                    spaceUuid,
                    dashboardUuid,
                },
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
        savedSqlUuid: string,
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
    ): Promise<KnexPaginatedData<SavedSqlDirectAccessListRow[]>> {
        const users = this.database(SavedSqlUserAccessTableName)
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
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
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
            .leftJoin(EmailTableName, function joinPrimaryEmail() {
                this.on(
                    `${EmailTableName}.user_id`,
                    `${UserTableName}.user_id`,
                ).andOnVal(`${EmailTableName}.is_primary`, true);
            })
            .where(
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                savedSqlUuid,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${SavedSqlTableName}.project_uuid`,
                this.database.ref(`${ProjectTableName}.project_uuid`),
            )
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(getActiveProjectMemberPredicate(this.database))
            .select({
                origin: this.database.raw('?', [DirectAccessOrigin.USER]),
                principalUuid: `${SavedSqlUserAccessTableName}.user_uuid`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                email: this.database.raw('COALESCE(??, ?)', [
                    `${EmailTableName}.email`,
                    '',
                ]),
                isInternal: `${UserTableName}.is_internal`,
                name: this.database.raw('NULL::text'),
                directRole: `${SavedSqlUserAccessTableName}.space_role`,
            });

        const groups = this.database(SavedSqlGroupAccessTableName)
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
            .innerJoin(GroupTableName, function joinSourceOrganizationGroup() {
                this.on(
                    `${GroupTableName}.group_uuid`,
                    `${SavedSqlGroupAccessTableName}.group_uuid`,
                ).andOn(
                    `${GroupTableName}.organization_id`,
                    `${ProjectTableName}.organization_id`,
                );
            })
            .where(
                `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                savedSqlUuid,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(
                `${SavedSqlTableName}.project_uuid`,
                this.database.ref(`${ProjectTableName}.project_uuid`),
            )
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .where(
                getActiveGrantedGroupPredicate(
                    this.database,
                    SavedSqlGroupAccessTableName,
                ),
            )
            .select({
                origin: this.database.raw('?', [DirectAccessOrigin.GROUP]),
                principalUuid: `${SavedSqlGroupAccessTableName}.group_uuid`,
                firstName: this.database.raw('NULL::text'),
                lastName: this.database.raw('NULL::text'),
                email: this.database.raw('NULL::text'),
                isInternal: this.database.raw('NULL::boolean'),
                name: `${GroupTableName}.name`,
                directRole: `${SavedSqlGroupAccessTableName}.space_role`,
            });

        let query = this.database
            .select<SavedSqlDirectAccessListRow[]>('*')
            .from(users.unionAll(groups).as('saved_sql_direct_access'));

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
        savedSqlUuid: string,
        userUuids: string[],
        organizationUuid: string,
    ): Promise<Record<string, SpaceMemberRole[]>> {
        if (userUuids.length === 0) {
            return {};
        }

        const rows = await this.database(SavedSqlGroupAccessTableName)
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
            .where(
                `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                savedSqlUuid,
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
            .where(
                `${SavedSqlTableName}.project_uuid`,
                this.database.ref(`${ProjectTableName}.project_uuid`),
            )
            .where(getActiveProjectMemberPredicate(this.database))
            .where(
                getActiveGrantedGroupPredicate(
                    this.database,
                    SavedSqlGroupAccessTableName,
                ),
            )
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select<{ userUuid: string; role: SpaceMemberRole }[]>(
                `${UserTableName}.user_uuid as userUuid`,
                `${SavedSqlGroupAccessTableName}.space_role as role`,
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
