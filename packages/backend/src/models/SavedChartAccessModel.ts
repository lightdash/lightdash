import { NotFoundError, type SpaceMemberRole } from '@lightdash/common';
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

export type SavedChartDirectAccess = DirectAccess;

export class SavedChartAccessModel implements DirectAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
        expectedOrganizationUuid: string,
    ): Promise<DirectAccessMutationContext> {
        const context = await trx(SavedChartsTableName)
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
            .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
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
            .forUpdate(SavedChartsTableName)
            .first();
        if (context === undefined) {
            throw new NotFoundError('Direct access target not found');
        }
        return context;
    }

    async upsertUserAccess(input: {
        resourceUuid: string;
        userUuid: string;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(input.actorRole, input.role);
        return this.database.transaction(async (trx) => {
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
                input.organizationUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanGrantDirectAccess(actorRole, input.role);
            if (
                !(await validateDirectAccessUser(trx, context, input.userUuid))
            ) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedChartUserAccessTableName)
                .where({
                    saved_chart_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: input.grantedByUserUuid === input.userUuid,
            });
            await trx(SavedChartUserAccessTableName)
                .insert({
                    saved_chart_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                })
                .onConflict(['saved_chart_uuid', 'user_uuid'])
                .merge({
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                    updated_at: trx.fn.now(),
                });
            return {
                ...context,
                beforeRole: existing?.space_role ?? null,
                afterRole: input.role,
            };
        });
    }

    async upsertGroupAccess(input: {
        resourceUuid: string;
        groupUuid: string;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(input.actorRole, input.role);
        return this.database.transaction(async (trx) => {
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
                input.organizationUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanGrantDirectAccess(actorRole, input.role);
            if (
                !(await validateDirectAccessGroup(
                    trx,
                    context,
                    input.groupUuid,
                ))
            ) {
                throw new NotFoundError('Direct access target not found');
            }
            const existing = await trx(SavedChartGroupAccessTableName)
                .where({
                    saved_chart_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: false,
            });
            await trx(SavedChartGroupAccessTableName)
                .insert({
                    saved_chart_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                })
                .onConflict(['saved_chart_uuid', 'group_uuid'])
                .merge({
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                    updated_at: trx.fn.now(),
                });
            return {
                ...context,
                beforeRole: existing?.space_role ?? null,
                afterRole: input.role,
            };
        });
    }

    async revokeUserAccess(input: {
        resourceUuid: string;
        userUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
        actorUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        const isSelfRevoke = input.actorUserUuid === input.userUuid;
        assertCanRevokeDirectAccess({
            actorRole: input.actorRole,
            isSelfRevoke,
        });
        return this.database.transaction(async (trx) => {
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
                input.organizationUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(SavedChartUserAccessTableName)
                .where({
                    saved_chart_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                })
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
            await trx(SavedChartUserAccessTableName)
                .where({
                    saved_chart_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                })
                .delete();
            return {
                ...context,
                beforeRole: existing.space_role,
                afterRole: null,
            };
        });
    }

    async revokeGroupAccess(input: {
        resourceUuid: string;
        groupUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanRevokeDirectAccess({
            actorRole: input.actorRole,
            isSelfRevoke: false,
        });
        return this.database.transaction(async (trx) => {
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
                input.organizationUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(SavedChartGroupAccessTableName)
                .where({
                    saved_chart_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
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
            await trx(SavedChartGroupAccessTableName)
                .where({
                    saved_chart_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .delete();
            return {
                ...context,
                beforeRole: existing.space_role,
                afterRole: null,
            };
        });
    }

    async resetAccess(input: {
        resourceUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        organizationUuid: string;
    }): Promise<DirectAccessResetResult> {
        assertCanResetDirectAccess(input.actorRole);
        return this.database.transaction(async (trx) => {
            const context = await SavedChartAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
                input.organizationUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanResetDirectAccess(actorRole);
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(SavedChartUserAccessTableName)
                    .where('saved_chart_uuid', input.resourceUuid)
                    .delete(),
                trx(SavedChartGroupAccessTableName)
                    .where('saved_chart_uuid', input.resourceUuid)
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
        const uniqueSavedChartUuids = [...new Set(savedChartUuids)];
        if (uniqueSavedChartUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedChartUserAccessTableName)
            .select({
                resourceUuid: `${SavedChartUserAccessTableName}.saved_chart_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${SavedChartUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartUserAccessTableName}.saved_chart_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${SavedChartsTableName}.project_uuid`,
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
                uniqueSavedChartUuids,
            )
            .where(`${SavedChartUserAccessTableName}.user_uuid`, userUuid)
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
            .whereNull(`${SavedChartsTableName}.deleted_at`)
            .unionAll(
                trx(SavedChartGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${SavedChartGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedChartGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedChartsTableName,
                        `${SavedChartsTableName}.saved_query_uuid`,
                        `${SavedChartGroupAccessTableName}.saved_chart_uuid`,
                    )
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
                        uniqueSavedChartUuids,
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
                    .whereNull(`${SavedChartsTableName}.dashboard_uuid`)
                    .whereNull(`${SavedChartsTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
