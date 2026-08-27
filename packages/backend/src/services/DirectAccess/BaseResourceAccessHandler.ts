import { subject } from '@casl/ability';
import {
    DirectAccessOrigin,
    ForbiddenError,
    getHighestSpaceRole,
    NotFoundError,
    ParameterError,
    SpaceMemberRole,
    SpaceRoleOrder,
    type DirectAccessGrant,
    type DirectAccessList,
    type DirectAccessListFilters,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { createActorFromUser } from '../../logging/caslAuditWrapper';
import type {
    DirectAccessMutationResult,
    DirectAccessResetResult,
} from '../../models/directAccessModelUtils';
import { BaseService } from '../BaseService';
import type {
    AccessContextForCasl,
    AccessTarget,
    SpacePermissionService,
} from '../SpaceService/SpacePermissionService';
import {
    auditDirectAccessMutation,
    auditDirectAccessReset,
    type DirectAccessAuditLogger,
} from './directAccessAudit';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import type {
    ResourceAccessHandler,
    ResourceAccessInput,
} from './ResourceAccessHandler';

export type DirectAccessListRow =
    | {
          origin: DirectAccessOrigin.USER;
          principalUuid: string;
          firstName: string;
          lastName: string;
          email: string;
          isInternal: boolean;
          directRole: SpaceMemberRole;
      }
    | {
          origin: DirectAccessOrigin.GROUP;
          principalUuid: string;
          name: string;
          directRole: SpaceMemberRole;
      };

export type DirectAccessTarget = {
    resourceUuid: string;
    organizationUuid: string;
    projectUuid: string;
    spaceUuid: string | null;
    accessTarget: AccessTarget;
    canReceiveDirectAccess: boolean;
};

type Principal =
    | { origin: DirectAccessOrigin.USER; uuid: string }
    | { origin: DirectAccessOrigin.GROUP; uuid: string };

export interface DirectAccessResourceAdapter<
    TTarget extends DirectAccessTarget = DirectAccessTarget,
> {
    auditResourceType: string;
    getTarget(input: ResourceAccessInput): Promise<TTarget>;
    getDirectAccessList(
        target: TTarget,
        options: {
            paginateArgs?: KnexPaginateArgs;
            searchQuery?: string;
            principal?: Principal;
        },
    ): Promise<KnexPaginatedData<DirectAccessListRow[]>>;
    getGroupRolesForUsers(
        target: TTarget,
        userUuids: string[],
    ): Promise<Record<string, SpaceMemberRole[]>>;
    getAdditionalEffectiveRolesForUsers?(
        target: TTarget,
        userUuids: string[],
    ): Promise<Record<string, SpaceMemberRole[]>>;
    upsertUserAccess(
        target: TTarget,
        input: { userUuid: string; role: SpaceMemberRole; actor: SessionUser },
    ): Promise<DirectAccessMutationResult>;
    upsertGroupAccess(
        target: TTarget,
        input: { groupUuid: string; role: SpaceMemberRole; actor: SessionUser },
    ): Promise<DirectAccessMutationResult>;
    revokeUserAccess(
        target: TTarget,
        input: { userUuid: string },
    ): Promise<DirectAccessMutationResult>;
    revokeGroupAccess(
        target: TTarget,
        input: { groupUuid: string },
    ): Promise<DirectAccessMutationResult>;
    resetAccess(target: TTarget): Promise<DirectAccessResetResult>;
}

const DEFAULT_ACCESS_LIST_PAGE: KnexPaginateArgs = {
    page: 1,
    pageSize: 100,
};

const hasAtLeastRole = (
    role: SpaceMemberRole,
    minimum: SpaceMemberRole,
): boolean => SpaceRoleOrder[role] >= SpaceRoleOrder[minimum];

export class BaseResourceAccessHandler<
    TTarget extends DirectAccessTarget = DirectAccessTarget,
>
    extends BaseService
    implements ResourceAccessHandler
{
    constructor(
        private readonly adapter: DirectAccessResourceAdapter<TTarget>,
        private readonly spacePermissionService: Pick<
            SpacePermissionService,
            | 'resolveAccess'
            | 'getSpaceAccessContextForUsers'
            | 'mergeAdminAccess'
        >,
        private readonly featureGate: Pick<
            DirectAccessFeatureGate,
            'isEnabledForUser'
        >,
        private readonly auditLogger?: DirectAccessAuditLogger,
    ) {
        super();
    }

    private async resolveTarget(input: ResourceAccessInput): Promise<{
        target: TTarget;
        actorRole: SpaceMemberRole;
    }> {
        if (
            !(await this.featureGate.isEnabledForUser({
                userUuid: input.user.userUuid,
                organizationUuid: input.user.organizationUuid,
            }))
        ) {
            throw new ForbiddenError('Direct access is not available');
        }
        if (!isValidUuid(input.resourceUuid)) {
            throw new NotFoundError('Access target not found');
        }

        let target: TTarget;
        let context: AccessContextForCasl;
        try {
            target = await this.adapter.getTarget(input);
            context = await this.spacePermissionService.resolveAccess(
                input.user.userUuid,
                target.accessTarget,
            );
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof ForbiddenError ||
                error instanceof ParameterError
            ) {
                throw new NotFoundError('Access target not found');
            }
            throw error;
        }

        const auditedAbility = this.createAuditedAbility(input.user);
        const isProjectAdmin = auditedAbility.can(
            'manage',
            subject('Project', {
                organizationUuid: target.organizationUuid,
                projectUuid: target.projectUuid,
            }),
        );
        const actorRole = isProjectAdmin
            ? SpaceMemberRole.ADMIN
            : getHighestSpaceRole(
                  context.access
                      .filter(
                          ({ userUuid }) => userUuid === input.user.userUuid,
                      )
                      .map(({ role }) => role),
              );
        if (actorRole === undefined) {
            throw new NotFoundError('Access target not found');
        }
        if (!target.canReceiveDirectAccess) {
            throw new ParameterError(
                'This resource inherits access and cannot receive direct grants',
            );
        }
        return { target, actorRole };
    }

    private static assertCanInspect(actorRole: SpaceMemberRole): void {
        if (!hasAtLeastRole(actorRole, SpaceMemberRole.EDITOR)) {
            throw new ForbiddenError(
                'Editor access or higher is required to manage access',
            );
        }
    }

    private static assertCanManageRole(
        actorRole: SpaceMemberRole,
        role?: SpaceMemberRole,
    ): void {
        BaseResourceAccessHandler.assertCanInspect(actorRole);
        if (role && !hasAtLeastRole(actorRole, role)) {
            throw new ForbiddenError(
                'Cannot manage a role above your effective access',
            );
        }
    }

    private async resolveGrants(
        target: TTarget,
        rows: DirectAccessListRow[],
    ): Promise<DirectAccessGrant[]> {
        const userUuids = rows.flatMap((row) =>
            row.origin === DirectAccessOrigin.USER ? [row.principalUuid] : [],
        );
        if (userUuids.length === 0) {
            return rows.map((row) => {
                if (row.origin !== DirectAccessOrigin.GROUP) {
                    throw new Error('Unexpected direct access principal');
                }
                return {
                    principal: {
                        type: DirectAccessOrigin.GROUP,
                        uuid: row.principalUuid,
                        name: row.name,
                    },
                    directRole: row.directRole,
                };
            });
        }

        const additionalRolesPromise = this.adapter
            .getAdditionalEffectiveRolesForUsers
            ? this.adapter.getAdditionalEffectiveRolesForUsers(
                  target,
                  userUuids,
              )
            : Promise.resolve<Record<string, SpaceMemberRole[]>>({});
        const [groupRoles, spaceContext, additionalRoles] = await Promise.all([
            this.adapter.getGroupRolesForUsers(target, userUuids),
            target.spaceUuid
                ? this.spacePermissionService.getSpaceAccessContextForUsers(
                      userUuids,
                      target.spaceUuid,
                  )
                : undefined,
            additionalRolesPromise,
        ]);
        const inheritedRoles = new Map<string, SpaceMemberRole[]>();
        if (spaceContext) {
            for (const access of this.spacePermissionService.mergeAdminAccess(
                spaceContext,
            )) {
                const roles = inheritedRoles.get(access.userUuid) ?? [];
                roles.push(access.role);
                inheritedRoles.set(access.userUuid, roles);
            }
        }

        return rows.map((row) => {
            if (row.origin === DirectAccessOrigin.GROUP) {
                return {
                    principal: {
                        type: DirectAccessOrigin.GROUP,
                        uuid: row.principalUuid,
                        name: row.name,
                    },
                    directRole: row.directRole,
                };
            }
            return {
                principal: {
                    type: DirectAccessOrigin.USER,
                    uuid: row.principalUuid,
                    firstName: row.firstName,
                    lastName: row.lastName,
                    email: row.email,
                    isInternal: row.isInternal,
                },
                directRole: row.directRole,
                effectiveRole:
                    getHighestSpaceRole([
                        row.directRole,
                        ...(groupRoles[row.principalUuid] ?? []),
                        ...(inheritedRoles.get(row.principalUuid) ?? []),
                        ...(additionalRoles[row.principalUuid] ?? []),
                    ]) ?? row.directRole,
            };
        });
    }

    private async getDirectGrant(
        target: TTarget,
        principal: Principal,
    ): Promise<DirectAccessGrant | undefined> {
        const { data } = await this.adapter.getDirectAccessList(target, {
            principal,
        });
        const [grant] = await this.resolveGrants(target, data);
        return grant;
    }

    private async getGrant(
        target: TTarget,
        principal: Principal,
    ): Promise<DirectAccessGrant> {
        const grant = await this.getDirectGrant(target, principal);
        if (!grant) {
            throw new NotFoundError('Direct access grant not found');
        }
        return grant;
    }

    private auditMutation(
        user: SessionUser,
        target: TTarget,
        principal: { type: 'user' | 'group'; uuid: string },
        result: DirectAccessMutationResult,
    ): void {
        auditDirectAccessMutation({
            actor: createActorFromUser(user),
            context: user.requestContext ?? {},
            resourceType: this.adapter.auditResourceType,
            resourceUuid: target.resourceUuid,
            principal,
            result,
            auditLogger: this.auditLogger,
        });
    }

    async listAccess({
        paginateArgs,
        filters,
        ...input
    }: ResourceAccessInput & {
        paginateArgs?: KnexPaginateArgs;
        filters?: DirectAccessListFilters;
    }): Promise<DirectAccessList> {
        const { target, actorRole } = await this.resolveTarget(input);
        BaseResourceAccessHandler.assertCanInspect(actorRole);
        const { data, pagination } = await this.adapter.getDirectAccessList(
            target,
            {
                paginateArgs: paginateArgs ?? DEFAULT_ACCESS_LIST_PAGE,
                searchQuery: filters?.searchQuery,
            },
        );
        return {
            data: await this.resolveGrants(target, data),
            ...(pagination ? { pagination } : {}),
        };
    }

    async replaceUserRole({
        userUuid,
        role,
        ...input
    }: ResourceAccessInput & {
        userUuid: string;
        role: SpaceMemberRole;
    }): Promise<DirectAccessGrant> {
        const { target, actorRole } = await this.resolveTarget(input);
        const principal = { origin: DirectAccessOrigin.USER, uuid: userUuid };
        const existing = await this.getDirectGrant(target, principal);
        BaseResourceAccessHandler.assertCanManageRole(
            actorRole,
            existing?.directRole,
        );
        BaseResourceAccessHandler.assertCanManageRole(actorRole, role);
        const result = await this.adapter.upsertUserAccess(target, {
            userUuid,
            role,
            actor: input.user,
        });
        this.auditMutation(
            input.user,
            target,
            { type: 'user', uuid: userUuid },
            result,
        );
        return this.getGrant(target, principal);
    }

    async replaceGroupRole({
        groupUuid,
        role,
        ...input
    }: ResourceAccessInput & {
        groupUuid: string;
        role: SpaceMemberRole;
    }): Promise<DirectAccessGrant> {
        const { target, actorRole } = await this.resolveTarget(input);
        const principal = {
            origin: DirectAccessOrigin.GROUP,
            uuid: groupUuid,
        };
        const existing = await this.getDirectGrant(target, principal);
        BaseResourceAccessHandler.assertCanManageRole(
            actorRole,
            existing?.directRole,
        );
        BaseResourceAccessHandler.assertCanManageRole(actorRole, role);
        const result = await this.adapter.upsertGroupAccess(target, {
            groupUuid,
            role,
            actor: input.user,
        });
        this.auditMutation(
            input.user,
            target,
            { type: 'group', uuid: groupUuid },
            result,
        );
        return this.getGrant(target, principal);
    }

    async revokeUser({
        userUuid,
        ...input
    }: ResourceAccessInput & { userUuid: string }): Promise<void> {
        const { target, actorRole } = await this.resolveTarget(input);
        if (userUuid !== input.user.userUuid) {
            const existing = await this.getDirectGrant(target, {
                origin: DirectAccessOrigin.USER,
                uuid: userUuid,
            });
            BaseResourceAccessHandler.assertCanManageRole(
                actorRole,
                existing?.directRole,
            );
        }
        const result = await this.adapter.revokeUserAccess(target, {
            userUuid,
        });
        this.auditMutation(
            input.user,
            target,
            { type: 'user', uuid: userUuid },
            result,
        );
    }

    async revokeGroup({
        groupUuid,
        ...input
    }: ResourceAccessInput & { groupUuid: string }): Promise<void> {
        const { target, actorRole } = await this.resolveTarget(input);
        const existing = await this.getDirectGrant(target, {
            origin: DirectAccessOrigin.GROUP,
            uuid: groupUuid,
        });
        BaseResourceAccessHandler.assertCanManageRole(
            actorRole,
            existing?.directRole,
        );
        const result = await this.adapter.revokeGroupAccess(target, {
            groupUuid,
        });
        this.auditMutation(
            input.user,
            target,
            { type: 'group', uuid: groupUuid },
            result,
        );
    }

    async reset(input: ResourceAccessInput): Promise<void> {
        const { target, actorRole } = await this.resolveTarget(input);
        BaseResourceAccessHandler.assertCanInspect(actorRole);
        const { data } = await this.adapter.getDirectAccessList(target, {});
        for (const row of data) {
            BaseResourceAccessHandler.assertCanManageRole(
                actorRole,
                row.directRole,
            );
        }
        const result = await this.adapter.resetAccess(target);
        auditDirectAccessReset({
            actor: createActorFromUser(input.user),
            context: input.user.requestContext ?? {},
            resourceType: this.adapter.auditResourceType,
            resourceUuid: target.resourceUuid,
            result,
            auditLogger: this.auditLogger,
        });
    }
}
