import { subject } from '@casl/ability';
import {
    DirectAccessOrigin,
    ForbiddenError,
    getHighestSpaceRole,
    NotFoundError,
    ParameterError,
    SpaceMemberRole,
    type DirectAccessGrant,
    type DirectAccessList,
    type DirectAccessListFilters,
    type KnexPaginateArgs,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { createActorFromUser } from '../../logging/caslAuditWrapper';
import type {
    SavedSqlAccessModel,
    SavedSqlDirectAccessListRow,
    SavedSqlMutationExpectation,
} from '../../models/SavedSqlAccessModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    auditDirectAccessMutation,
    auditDirectAccessReset,
    type DirectAccessAuditLogger,
} from './directAccessAudit';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import { type ResourceAccessHandler } from './ResourceAccessHandler';

type SavedSqlAccessInput = {
    user: SessionUser;
    projectUuid: string;
    resourceUuid: string;
};

type SavedSqlTarget = Awaited<ReturnType<SavedSqlModel['getByUuid']>>;

const DEFAULT_ACCESS_LIST_PAGE: KnexPaginateArgs = {
    page: 1,
    pageSize: 100,
};

export class SavedSqlAccessHandler
    extends BaseService
    implements ResourceAccessHandler
{
    private readonly savedSqlAccessModel: SavedSqlAccessModel;

    private readonly savedSqlModel: SavedSqlModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly featureGate: DirectAccessFeatureGate;

    private readonly auditLogger?: DirectAccessAuditLogger;

    constructor({
        savedSqlAccessModel,
        savedSqlModel,
        spacePermissionService,
        featureGate,
        auditLogger,
    }: {
        savedSqlAccessModel: SavedSqlAccessModel;
        savedSqlModel: SavedSqlModel;
        spacePermissionService: SpacePermissionService;
        featureGate: DirectAccessFeatureGate;
        auditLogger?: DirectAccessAuditLogger;
    }) {
        super();
        this.savedSqlAccessModel = savedSqlAccessModel;
        this.savedSqlModel = savedSqlModel;
        this.spacePermissionService = spacePermissionService;
        this.featureGate = featureGate;
        this.auditLogger = auditLogger;
    }

    private async assertEnabled(user: SessionUser): Promise<void> {
        if (
            !(await this.featureGate.isEnabledForUser({
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            }))
        ) {
            throw new ForbiddenError('Direct access is not available');
        }
    }

    private async resolveSavedSql(input: SavedSqlAccessInput): Promise<{
        savedSql: SavedSqlTarget;
        accessContext: Awaited<
            ReturnType<SpacePermissionService['resolveAccess']>
        >;
    }> {
        await this.assertEnabled(input.user);
        if (!isValidUuid(input.resourceUuid)) {
            throw new NotFoundError('Access target not found');
        }

        try {
            const savedSql = await this.savedSqlModel.getByUuid(
                input.resourceUuid,
                { projectUuid: input.projectUuid },
            );
            if (savedSql.dashboard !== null) {
                throw new NotFoundError('Access target not found');
            }
            const accessContext =
                await this.spacePermissionService.resolveAccess(
                    input.user.userUuid,
                    {
                        type: 'sqlChart',
                        savedSqlUuid: savedSql.savedSqlUuid,
                        spaceUuid: savedSql.space.uuid,
                    },
                );
            const auditedAbility = this.createAuditedAbility(input.user);
            if (
                auditedAbility.cannot(
                    'view',
                    subject('SavedChart', {
                        ...accessContext,
                        metadata: { savedSqlUuid: savedSql.savedSqlUuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
            return { savedSql, accessContext };
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
    }

    private async assertAdmin(input: SavedSqlAccessInput): Promise<{
        savedSql: SavedSqlTarget;
        accessContext: Awaited<
            ReturnType<SpacePermissionService['resolveAccess']>
        >;
    }> {
        const resolved = await this.resolveSavedSql(input);
        const { accessContext, savedSql } = resolved;
        const hasAdminRole =
            accessContext.admins.some(
                ({ userUuid }) => userUuid === input.user.userUuid,
            ) ||
            accessContext.access.some(
                ({ userUuid, role }) =>
                    userUuid === input.user.userUuid &&
                    role === SpaceMemberRole.ADMIN,
            );
        const auditedAbility = this.createAuditedAbility(input.user);
        const hasManageCapability = auditedAbility.can(
            'manage',
            subject('SavedChart', {
                ...accessContext,
                metadata: { savedSqlUuid: savedSql.savedSqlUuid },
            }),
        );
        if (!hasAdminRole || !hasManageCapability) {
            throw new ForbiddenError('Admin access is required');
        }
        return resolved;
    }

    private async resolveGrants(
        savedSql: SavedSqlTarget,
        rows: SavedSqlDirectAccessListRow[],
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

        const [groupRolesByUserUuid, spaceContext] = await Promise.all([
            this.savedSqlAccessModel.getGroupRolesForUsers(
                savedSql.savedSqlUuid,
                userUuids,
                savedSql.organization.organizationUuid,
            ),
            this.spacePermissionService.getSpaceAccessContextForUsers(
                userUuids,
                savedSql.space.uuid,
            ),
        ]);
        const logicalRolesByUserUuid = new Map<string, SpaceMemberRole[]>();
        for (const access of this.spacePermissionService.mergeAdminAccess(
            spaceContext,
        )) {
            const roles = logicalRolesByUserUuid.get(access.userUuid) ?? [];
            roles.push(access.role);
            logicalRolesByUserUuid.set(access.userUuid, roles);
        }
        for (const { userUuid } of spaceContext.admins) {
            const roles = logicalRolesByUserUuid.get(userUuid) ?? [];
            roles.push(SpaceMemberRole.ADMIN);
            logicalRolesByUserUuid.set(userUuid, roles);
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
                        ...(groupRolesByUserUuid[row.principalUuid] ?? []),
                        ...(logicalRolesByUserUuid.get(row.principalUuid) ??
                            []),
                    ]) ?? row.directRole,
            };
        });
    }

    private static getMutationExpectation(
        savedSql: SavedSqlTarget,
    ): SavedSqlMutationExpectation {
        return {
            organizationUuid: savedSql.organization.organizationUuid,
            projectUuid: savedSql.project.projectUuid,
            spaceUuid: savedSql.space.uuid,
            dashboardUuid: savedSql.dashboard?.uuid ?? null,
        };
    }

    private async getGrant(
        savedSql: SavedSqlTarget,
        principal: { origin: DirectAccessOrigin; uuid: string },
    ): Promise<DirectAccessGrant> {
        const { data } = await this.savedSqlAccessModel.getDirectAccessList(
            savedSql.savedSqlUuid,
            savedSql.organization.organizationUuid,
            { principal },
        );
        const [grant] = await this.resolveGrants(savedSql, data);
        if (!grant) {
            throw new NotFoundError('Direct access grant not found');
        }
        return grant;
    }

    async listAccess({
        user,
        projectUuid,
        resourceUuid,
        paginateArgs,
        filters,
    }: SavedSqlAccessInput & {
        paginateArgs?: KnexPaginateArgs;
        filters?: DirectAccessListFilters;
    }): Promise<DirectAccessList> {
        const { savedSql } = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        const { data, pagination } =
            await this.savedSqlAccessModel.getDirectAccessList(
                savedSql.savedSqlUuid,
                savedSql.organization.organizationUuid,
                {
                    paginateArgs: paginateArgs ?? DEFAULT_ACCESS_LIST_PAGE,
                    searchQuery: filters?.searchQuery,
                },
            );
        return {
            data: await this.resolveGrants(savedSql, data),
            ...(pagination ? { pagination } : {}),
        };
    }

    async replaceUserRole({
        user,
        projectUuid,
        resourceUuid,
        userUuid,
        role,
    }: SavedSqlAccessInput & {
        userUuid: string;
        role: SpaceMemberRole;
    }): Promise<DirectAccessGrant> {
        const { savedSql } = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        const result = await this.savedSqlAccessModel.upsertUserAccess({
            resourceUuid: savedSql.savedSqlUuid,
            userUuid,
            role,
            grantedByUserUuid: user.userUuid,
            ...SavedSqlAccessHandler.getMutationExpectation(savedSql),
        });
        auditDirectAccessMutation({
            actor: createActorFromUser(user),
            context: user.requestContext ?? {},
            resourceType: 'SavedSql',
            resourceUuid: savedSql.savedSqlUuid,
            principal: { type: 'user', uuid: userUuid },
            result,
            auditLogger: this.auditLogger,
        });
        return this.getGrant(savedSql, {
            origin: DirectAccessOrigin.USER,
            uuid: userUuid,
        });
    }

    async replaceGroupRole({
        user,
        projectUuid,
        resourceUuid,
        groupUuid,
        role,
    }: SavedSqlAccessInput & {
        groupUuid: string;
        role: SpaceMemberRole;
    }): Promise<DirectAccessGrant> {
        const { savedSql } = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        const result = await this.savedSqlAccessModel.upsertGroupAccess({
            resourceUuid: savedSql.savedSqlUuid,
            groupUuid,
            role,
            grantedByUserUuid: user.userUuid,
            ...SavedSqlAccessHandler.getMutationExpectation(savedSql),
        });
        auditDirectAccessMutation({
            actor: createActorFromUser(user),
            context: user.requestContext ?? {},
            resourceType: 'SavedSql',
            resourceUuid: savedSql.savedSqlUuid,
            principal: { type: 'group', uuid: groupUuid },
            result,
            auditLogger: this.auditLogger,
        });
        return this.getGrant(savedSql, {
            origin: DirectAccessOrigin.GROUP,
            uuid: groupUuid,
        });
    }

    async revokeUser({
        user,
        projectUuid,
        resourceUuid,
        userUuid,
    }: SavedSqlAccessInput & { userUuid: string }): Promise<void> {
        const input = { user, projectUuid, resourceUuid };
        const { savedSql } =
            userUuid === user.userUuid
                ? await this.resolveSavedSql(input)
                : await this.assertAdmin(input);
        const result = await this.savedSqlAccessModel.revokeUserAccess({
            resourceUuid: savedSql.savedSqlUuid,
            userUuid,
            ...SavedSqlAccessHandler.getMutationExpectation(savedSql),
        });
        auditDirectAccessMutation({
            actor: createActorFromUser(user),
            context: user.requestContext ?? {},
            resourceType: 'SavedSql',
            resourceUuid: savedSql.savedSqlUuid,
            principal: { type: 'user', uuid: userUuid },
            result,
            auditLogger: this.auditLogger,
        });
    }

    async revokeGroup({
        user,
        projectUuid,
        resourceUuid,
        groupUuid,
    }: SavedSqlAccessInput & { groupUuid: string }): Promise<void> {
        const { savedSql } = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        const result = await this.savedSqlAccessModel.revokeGroupAccess({
            resourceUuid: savedSql.savedSqlUuid,
            groupUuid,
            ...SavedSqlAccessHandler.getMutationExpectation(savedSql),
        });
        auditDirectAccessMutation({
            actor: createActorFromUser(user),
            context: user.requestContext ?? {},
            resourceType: 'SavedSql',
            resourceUuid: savedSql.savedSqlUuid,
            principal: { type: 'group', uuid: groupUuid },
            result,
            auditLogger: this.auditLogger,
        });
    }

    async reset(input: SavedSqlAccessInput): Promise<void> {
        const { savedSql } = await this.assertAdmin(input);
        const result = await this.savedSqlAccessModel.resetAccess({
            resourceUuid: savedSql.savedSqlUuid,
            ...SavedSqlAccessHandler.getMutationExpectation(savedSql),
        });
        auditDirectAccessReset({
            actor: createActorFromUser(input.user),
            context: input.user.requestContext ?? {},
            resourceType: 'SavedSql',
            resourceUuid: savedSql.savedSqlUuid,
            result,
            auditLogger: this.auditLogger,
        });
    }
}
