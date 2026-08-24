import {
    canDelegateDirectAccessRole,
    ForbiddenError,
    OrganizationMemberRole,
    SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import { UserTableName } from '../database/entities/users';

export type DirectAccess = {
    organizationUuid: UUID;
    projectUuid: UUID;
    userRole: SpaceMemberRole | null;
    groupRoles: SpaceMemberRole[];
};

export type DirectAccessRow = {
    resourceUuid: UUID;
    organizationUuid: UUID;
    projectUuid: UUID;
    role: SpaceMemberRole;
    groupUuid: UUID | null;
};

export type DirectAccessMutationContext = {
    organizationId: number;
    organizationUuid: UUID;
    projectId: number;
    projectUuid: UUID;
};

export type DirectAccessMutationResult = DirectAccessMutationContext & {
    beforeRole: SpaceMemberRole | null;
    afterRole: SpaceMemberRole | null;
};

export type DirectAccessResetResult = DirectAccessMutationContext & {
    revokedUsers: number;
    revokedGroups: number;
};

/**
 * The resolver must return only after locking every authority source that
 * could lower the actor's role. Those locks must be held by `transaction`
 * until the direct access mutation completes. When authority depends on the
 * absence of a row, the resolver must lock a stable anchor or use an
 * equivalent serialization mechanism.
 */
export type DirectAccessModelActorRoleResolver = (input: {
    transaction: Knex.Transaction;
    context: DirectAccessMutationContext;
}) => Promise<SpaceMemberRole | undefined>;

export type DirectAccessModel = {
    getUserAccess(
        resourceUuids: UUID[],
        userUuid: UUID,
    ): Promise<Record<string, DirectAccess>>;
    upsertUserAccess(input: {
        resourceUuid: UUID;
        userUuid: UUID;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        grantedByUserUuid: UUID;
    }): Promise<DirectAccessMutationResult>;
    upsertGroupAccess(input: {
        resourceUuid: UUID;
        groupUuid: UUID;
        role: SpaceMemberRole;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        grantedByUserUuid: UUID;
    }): Promise<DirectAccessMutationResult>;
    revokeUserAccess(input: {
        resourceUuid: UUID;
        userUuid: UUID;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
        actorUserUuid: UUID;
    }): Promise<DirectAccessMutationResult>;
    revokeGroupAccess(input: {
        resourceUuid: UUID;
        groupUuid: UUID;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
    }): Promise<DirectAccessMutationResult>;
    resetAccess(input: {
        resourceUuid: UUID;
        actorRole: SpaceMemberRole | undefined;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
    }): Promise<DirectAccessResetResult>;
};

export const assertCanGrantDirectAccess = (
    actorRole: SpaceMemberRole | undefined,
    requestedRole: SpaceMemberRole,
): void => {
    if (!canDelegateDirectAccessRole(actorRole, requestedRole)) {
        throw new ForbiddenError(
            'You cannot grant the requested direct access role',
        );
    }
};

export const assertCanRevokeDirectAccess = ({
    actorRole,
    existingRole,
    isSelfRevoke,
}: {
    actorRole: SpaceMemberRole | undefined;
    existingRole?: SpaceMemberRole;
    isSelfRevoke: boolean;
}): void => {
    if (isSelfRevoke) {
        return;
    }
    if (
        actorRole === undefined ||
        actorRole === SpaceMemberRole.VIEWER ||
        (existingRole !== undefined &&
            !canDelegateDirectAccessRole(actorRole, existingRole))
    ) {
        throw new ForbiddenError('You cannot revoke this direct access role');
    }
};

export const assertCanResetDirectAccess = (
    actorRole: SpaceMemberRole | undefined,
): void => {
    if (actorRole !== SpaceMemberRole.ADMIN) {
        throw new ForbiddenError('Only admins can reset direct access');
    }
};

/**
 * Direct grants cannot create project membership. This predicate keeps stored
 * grants inert unless the principal still has a current project access path.
 */
export const getActiveProjectMemberPredicate =
    (trx: Knex) =>
    (predicate: Knex.QueryBuilder): void => {
        void predicate
            .where(`${UserTableName}.is_active`, true)
            .andWhere((accessPath) => {
                void accessPath
                    .whereNot(
                        `${OrganizationMembershipsTableName}.role`,
                        OrganizationMemberRole.MEMBER,
                    )
                    .orWhereNotNull(
                        `${OrganizationMembershipsTableName}.role_uuid`,
                    )
                    .orWhereExists((subquery) => {
                        void subquery
                            .select('*')
                            .from({
                                organization_extra_role:
                                    OrganizationMembershipCustomRolesTableName,
                            })
                            .where(
                                'organization_extra_role.user_id',
                                trx.ref(`${UserTableName}.user_id`),
                            )
                            .where(
                                'organization_extra_role.organization_id',
                                trx.ref(`${ProjectTableName}.organization_id`),
                            );
                    })
                    .orWhereExists((subquery) => {
                        void subquery
                            .select('*')
                            .from({
                                direct_project_membership:
                                    ProjectMembershipsTableName,
                            })
                            .where(
                                'direct_project_membership.user_id',
                                trx.ref(`${UserTableName}.user_id`),
                            )
                            .where(
                                'direct_project_membership.project_id',
                                trx.ref(`${ProjectTableName}.project_id`),
                            );
                    })
                    .orWhereExists((subquery) => {
                        void subquery
                            .select('*')
                            .from({
                                project_group_membership:
                                    ProjectGroupAccessTableName,
                            })
                            .innerJoin(
                                {
                                    current_project_group_membership:
                                        GroupMembershipTableName,
                                },
                                'current_project_group_membership.group_uuid',
                                'project_group_membership.group_uuid',
                            )
                            .where(
                                'project_group_membership.project_uuid',
                                trx.ref(`${ProjectTableName}.project_uuid`),
                            )
                            .where(
                                'current_project_group_membership.user_id',
                                trx.ref(`${UserTableName}.user_id`),
                            )
                            .where(
                                'current_project_group_membership.organization_id',
                                trx.ref(`${ProjectTableName}.organization_id`),
                            );
                    });
            });
    };

/**
 * A group grant is inert unless the granted group itself still holds current
 * access to the resource's project. Without this predicate, a grant made to a
 * project group would keep working after the group is removed from the
 * project, for any member who retains a separate project access path.
 */
export const getActiveGrantedGroupPredicate =
    (trx: Knex, groupAccessTable: string) =>
    (predicate: Knex.QueryBuilder): void => {
        void predicate.whereExists((subquery) => {
            void subquery
                .select('*')
                .from({
                    granted_group_project_access: ProjectGroupAccessTableName,
                })
                .where(
                    'granted_group_project_access.group_uuid',
                    trx.ref(`${groupAccessTable}.group_uuid`),
                )
                .where(
                    'granted_group_project_access.project_uuid',
                    trx.ref(`${ProjectTableName}.project_uuid`),
                );
        });
    };

export const validateDirectAccessUser = async (
    trx: Knex,
    context: DirectAccessMutationContext,
    userUuid: string,
): Promise<boolean> => {
    const user = await trx(UserTableName)
        .innerJoin(
            OrganizationMembershipsTableName,
            `${OrganizationMembershipsTableName}.user_id`,
            `${UserTableName}.user_id`,
        )
        .innerJoin(
            ProjectTableName,
            `${ProjectTableName}.organization_id`,
            `${OrganizationMembershipsTableName}.organization_id`,
        )
        .where(`${UserTableName}.user_uuid`, userUuid)
        .where(`${ProjectTableName}.project_id`, context.projectId)
        .where(getActiveProjectMemberPredicate(trx))
        .first(`${UserTableName}.user_id`);

    return user !== undefined;
};

export const validateDirectAccessGroup = async (
    trx: Knex,
    context: DirectAccessMutationContext,
    groupUuid: string,
): Promise<boolean> => {
    const group = await trx(GroupTableName)
        .innerJoin(
            ProjectGroupAccessTableName,
            `${ProjectGroupAccessTableName}.group_uuid`,
            `${GroupTableName}.group_uuid`,
        )
        .where(`${GroupTableName}.group_uuid`, groupUuid)
        .where(`${GroupTableName}.organization_id`, context.organizationId)
        .where(
            `${ProjectGroupAccessTableName}.project_uuid`,
            context.projectUuid,
        )
        .first(`${GroupTableName}.group_uuid`);

    return group !== undefined;
};

export const groupDirectAccessRows = (
    rows: DirectAccessRow[],
): Record<string, DirectAccess> => {
    const accessByResource: Record<string, DirectAccess> = {};
    for (const row of rows) {
        const access = accessByResource[row.resourceUuid] ?? {
            organizationUuid: row.organizationUuid,
            projectUuid: row.projectUuid,
            userRole: null,
            groupRoles: [],
        };
        if (row.groupUuid === null) {
            access.userRole = row.role;
        } else {
            access.groupRoles.push(row.role);
        }
        accessByResource[row.resourceUuid] = access;
    }
    return accessByResource;
};
