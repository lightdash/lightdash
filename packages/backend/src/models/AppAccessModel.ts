import { NotFoundError, type SpaceMemberRole } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import { AppsTableName } from '../database/entities/apps';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
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

export type AppDirectAccess = DirectAccess;

export class AppAccessModel implements DirectAccessModel {
    constructor(private readonly database: Knex) {}

    private static async getMutationContext(
        trx: Knex,
        resourceUuid: string,
    ): Promise<DirectAccessMutationContext> {
        const context = await trx(AppsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(`${AppsTableName}.app_id`, resourceUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .select<DirectAccessMutationContext>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .forUpdate(AppsTableName)
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
            const context = await AppAccessModel.getMutationContext(
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
            const existing = await trx(AppUserAccessTableName)
                .where({
                    app_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: input.grantedByUserUuid === input.userUuid,
            });
            await trx(AppUserAccessTableName)
                .insert({
                    app_uuid: input.resourceUuid,
                    user_uuid: input.userUuid,
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                })
                .onConflict(['app_uuid', 'user_uuid'])
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
            const context = await AppAccessModel.getMutationContext(
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
            const existing = await trx(AppGroupAccessTableName)
                .where({
                    app_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: false,
            });
            await trx(AppGroupAccessTableName)
                .insert({
                    app_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                    space_role: input.role,
                    granted_by_user_uuid: input.grantedByUserUuid,
                })
                .onConflict(['app_uuid', 'group_uuid'])
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
            const context = await AppAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(AppUserAccessTableName)
                .where({
                    app_uuid: input.resourceUuid,
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
            await trx(AppUserAccessTableName)
                .where({
                    app_uuid: input.resourceUuid,
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
            const context = await AppAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            const existing = await trx(AppGroupAccessTableName)
                .where({
                    app_uuid: input.resourceUuid,
                    group_uuid: input.groupUuid,
                })
                .first<{ space_role: SpaceMemberRole }>('space_role')
                .forUpdate();
            assertCanRevokeDirectAccess({
                actorRole,
                existingRole: existing?.space_role,
                isSelfRevoke: false,
            });
            await trx(AppGroupAccessTableName)
                .where({
                    app_uuid: input.resourceUuid,
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
            const context = await AppAccessModel.getMutationContext(
                trx,
                input.resourceUuid,
            );
            const actorRole = await input.actorRoleResolver({
                transaction: trx,
                context,
            });
            assertCanResetDirectAccess(actorRole);
            const [revokedUsers, revokedGroups] = await Promise.all([
                trx(AppUserAccessTableName)
                    .where('app_uuid', input.resourceUuid)
                    .delete(),
                trx(AppGroupAccessTableName)
                    .where('app_uuid', input.resourceUuid)
                    .delete(),
            ]);
            return { ...context, revokedUsers, revokedGroups };
        });
    }

    async getUserAccess(
        appUuids: string[],
        userUuid: string,
        { trx = this.database }: { trx?: Knex } = {},
    ): Promise<Record<string, AppDirectAccess>> {
        const uniqueAppUuids = [...new Set(appUuids)];
        if (uniqueAppUuids.length === 0) {
            return {};
        }

        const rows: DirectAccessRow[] = await trx(AppUserAccessTableName)
            .select({
                resourceUuid: `${AppUserAccessTableName}.app_uuid`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                role: `${AppUserAccessTableName}.space_role`,
                groupUuid: trx.raw('NULL'),
            })
            .innerJoin(
                AppsTableName,
                `${AppsTableName}.app_id`,
                `${AppUserAccessTableName}.app_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${AppsTableName}.project_uuid`,
            )
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
            .where(getActiveProjectMemberPredicate(trx))
            .whereNull(`${AppsTableName}.deleted_at`)
            .unionAll(
                trx(AppGroupAccessTableName)
                    .select({
                        resourceUuid: `${AppGroupAccessTableName}.app_uuid`,
                        organizationUuid: `${OrganizationTableName}.organization_uuid`,
                        projectUuid: `${ProjectTableName}.project_uuid`,
                        role: `${AppGroupAccessTableName}.space_role`,
                        groupUuid: `${AppGroupAccessTableName}.group_uuid`,
                    })
                    .innerJoin(
                        AppsTableName,
                        `${AppsTableName}.app_id`,
                        `${AppGroupAccessTableName}.app_uuid`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${ProjectTableName}.project_uuid`,
                        `${AppsTableName}.project_uuid`,
                    )
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
                    .whereNull(`${AppsTableName}.deleted_at`),
            );

        return groupDirectAccessRows(rows);
    }
}
