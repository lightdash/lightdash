import { NotFoundError, type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
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

export type SavedSqlDirectAccess = DirectAccess;

export class SavedSqlAccessModel implements DirectAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
    ): Promise<DirectAccessMutationContext> {
        const context = await trx(SavedSqlTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${SavedSqlTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${SavedSqlTableName}.saved_sql_uuid`, resourceUuid)
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .select<DirectAccessMutationContext>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .forUpdate(SavedSqlTableName)
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
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(input.actorRole, input.role);
        return this.database.transaction(async (trx) => {
            const context = await SavedSqlAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
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
            const existing = await trx(SavedSqlUserAccessTableName)
                .where({
                    saved_sql_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: input.grantedByUserUuid === input.userUuid,
            });
            await trx(SavedSqlUserAccessTableName)
                .insert({
                    saved_sql_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                })
                .onConflict(['saved_sql_uuid', 'user_uuid'])
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
        grantedByUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        assertCanGrantDirectAccess(input.actorRole, input.role);
        return this.database.transaction(async (trx) => {
            const context = await SavedSqlAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
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
            const existing = await trx(SavedSqlGroupAccessTableName)
                .where({
                    saved_sql_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: false,
            });
            await trx(SavedSqlGroupAccessTableName)
                .insert({
                    saved_sql_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                })
                .onConflict(['saved_sql_uuid', 'group_uuid'])
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
        actorUserUuid: string;
    }): Promise<DirectAccessMutationResult> {
        const isSelfRevoke = input.actorUserUuid === input.userUuid;
        assertCanRevokeDirectAccess({
            actorRole: input.actorRole,
            isSelfRevoke,
        });
        return this.database.transaction(async (trx) => {
            const context = await SavedSqlAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(SavedSqlUserAccessTableName)
                .where({
                    saved_sql_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                })
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
            await trx(SavedSqlUserAccessTableName)
                .where({
                    saved_sql_uuid: input.resourceUuid,
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
    }): Promise<DirectAccessMutationResult> {
        assertCanRevokeDirectAccess({
            actorRole: input.actorRole,
            isSelfRevoke: false,
        });
        return this.database.transaction(async (trx) => {
            const context = await SavedSqlAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(SavedSqlGroupAccessTableName)
                .where({
                    saved_sql_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: false,
            });
            await trx(SavedSqlGroupAccessTableName)
                .where({
                    saved_sql_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .delete();
            return {
                ...context,
                beforeRole: existing?.space_role ?? null,
                afterRole: null,
            };
        });
    }

    async resetAccess(input: {
        resourceUuid: string;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
    }): Promise<DirectAccessResetResult> {
        assertCanResetDirectAccess(input.actorRole);
        return this.database.transaction(async (trx) => {
            const context = await SavedSqlAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanResetDirectAccess(actorRole);
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(SavedSqlUserAccessTableName)
                    .where('saved_sql_uuid', input.resourceUuid)
                    .delete(),
                trx(SavedSqlGroupAccessTableName)
                    .where('saved_sql_uuid', input.resourceUuid)
                    .delete(),
            ]);
            return { ...context, revokedUsers, revokedGroups };
        });
    }

    async getUserAccess(
        savedSqlUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<string, SavedSqlDirectAccess>> {
        const uniqueSavedSqlUuids = [...new Set(savedSqlUuids)];
        if (uniqueSavedSqlUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(SavedSqlUserAccessTableName)
            .select({
                resourceUuid: `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${SavedSqlUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                SavedSqlTableName,
                `${SavedSqlTableName}.saved_sql_uuid`,
                `${SavedSqlUserAccessTableName}.saved_sql_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${SavedSqlTableName}.project_uuid`,
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
                uniqueSavedSqlUuids,
            )
            .where(`${SavedSqlUserAccessTableName}.user_uuid`, userUuid)
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
            .whereNull(`${SavedSqlTableName}.deleted_at`)
            .unionAll(
                trx(SavedSqlGroupAccessTableName)
                    .select({
                        resourceUuid: `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${SavedSqlGroupAccessTableName}.space_role`,
                        groupUuid: `${SavedSqlGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        SavedSqlTableName,
                        `${SavedSqlTableName}.saved_sql_uuid`,
                        `${SavedSqlGroupAccessTableName}.saved_sql_uuid`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_uuid`,
                        `${SavedSqlTableName}.project_uuid`,
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
                        uniqueSavedSqlUuids,
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
                            SavedSqlGroupAccessTableName,
                        ),
                    )
                    .whereNull(`${SavedSqlTableName}.dashboard_uuid`)
                    .whereNull(`${SavedSqlTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
