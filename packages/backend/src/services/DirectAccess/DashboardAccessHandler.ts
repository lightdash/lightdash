import {
    DirectAccessOrigin,
    ForbiddenError,
    getHighestSpaceRole,
    NotFoundError,
    SpaceMemberRole,
    type Dashboard,
    type DirectAccessGrant,
    type DirectAccessList,
    type DirectAccessListFilters,
    type KnexPaginateArgs,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import type {
    DashboardAccessModel,
    DashboardDirectAccessListRow,
} from '../../models/DashboardAccessModel';
import { BaseService } from '../BaseService';
import type { DashboardService } from '../DashboardService/DashboardService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import type { DirectAccessService } from './DirectAccessService';
import { type ResourceAccessHandler } from './ResourceAccessHandler';

type DashboardAccessInput = {
    user: SessionUser;
    projectUuid: string;
    resourceUuid: string;
};

// A list call without explicit pagination must not read every grant row.
const DEFAULT_ACCESS_LIST_PAGE: KnexPaginateArgs = { page: 1, pageSize: 100 };

export class DashboardAccessHandler
    extends BaseService
    implements ResourceAccessHandler
{
    private readonly dashboardAccessModel: DashboardAccessModel;

    private readonly dashboardService: DashboardService;

    private readonly directAccessService: DirectAccessService;

    private readonly spacePermissionService: SpacePermissionService;

    constructor({
        dashboardAccessModel,
        dashboardService,
        directAccessService,
        spacePermissionService,
    }: {
        dashboardAccessModel: DashboardAccessModel;
        dashboardService: DashboardService;
        directAccessService: DirectAccessService;
        spacePermissionService: SpacePermissionService;
    }) {
        super();
        this.dashboardAccessModel = dashboardAccessModel;
        this.dashboardService = dashboardService;
        this.directAccessService = directAccessService;
        this.spacePermissionService = spacePermissionService;
    }

    private async resolveDashboard({
        user,
        projectUuid,
        resourceUuid,
    }: DashboardAccessInput): Promise<Dashboard> {
        await this.directAccessService.assertEnabled(user);
        if (!isValidUuid(resourceUuid)) {
            throw new NotFoundError('Access target not found');
        }

        let dashboard: Dashboard;
        try {
            dashboard = await this.dashboardService.assertViewAccess(
                user,
                resourceUuid,
                {
                    projectUuid,
                    includeDependencies: false,
                    strictUuid: true,
                },
            );
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof ForbiddenError
            ) {
                throw new NotFoundError('Access target not found');
            }
            throw error;
        }

        return dashboard;
    }

    private async assertAdmin(input: DashboardAccessInput): Promise<Dashboard> {
        const dashboard = await this.resolveDashboard(input);
        const role = getHighestSpaceRole(
            (dashboard.access ?? [])
                .filter(({ userUuid }) => userUuid === input.user.userUuid)
                .map(({ role: accessRole }) => accessRole),
        );
        if (role === SpaceMemberRole.ADMIN) {
            return dashboard;
        }
        // Org and project admins reach every space through CASL rather than
        // space access rows, so merge their standing before denying — the
        // same source resolveGrants merges for listed principals.
        const spaceContext =
            await this.spacePermissionService.getSpaceAccessContextForUsers(
                [input.user.userUuid],
                dashboard.spaceUuid,
            );
        const isOrgOrProjectAdmin = spaceContext.admins.some(
            ({ userUuid }) => userUuid === input.user.userUuid,
        );
        if (!isOrgOrProjectAdmin) {
            throw new ForbiddenError('Admin access is required');
        }
        return dashboard;
    }

    private async getGrant(
        dashboard: Dashboard,
        principal: { origin: DirectAccessOrigin; uuid: string },
    ): Promise<DirectAccessGrant> {
        const { data } = await this.dashboardAccessModel.getDirectAccessList(
            dashboard.uuid,
            dashboard.organizationUuid,
            { principal },
        );
        const row = data[0];
        if (!row) {
            throw new NotFoundError('Direct access grant not found');
        }

        const [grant] = await this.resolveGrants(dashboard, [row]);
        if (!grant) {
            throw new NotFoundError('Direct access grant not found');
        }
        return grant;
    }

    private async resolveGrants(
        dashboard: Dashboard,
        rows: DashboardDirectAccessListRow[],
    ): Promise<DirectAccessGrant[]> {
        const userUuids = rows
            .filter(
                (
                    row,
                ): row is Extract<
                    DashboardDirectAccessListRow,
                    { origin: DirectAccessOrigin.USER }
                > => row.origin === DirectAccessOrigin.USER,
            )
            .map(({ principalUuid }) => principalUuid);

        if (userUuids.length === 0) {
            const groupRows = rows.filter(
                (
                    row,
                ): row is Extract<
                    DashboardDirectAccessListRow,
                    { origin: DirectAccessOrigin.GROUP }
                > => row.origin === DirectAccessOrigin.GROUP,
            );
            return groupRows.map((row) => ({
                principal: {
                    type: DirectAccessOrigin.GROUP,
                    uuid: row.principalUuid,
                    name: row.name,
                },
                directRole: row.directRole,
            }));
        }

        const [groupRolesByUserUuid, spaceContext] = await Promise.all([
            this.dashboardAccessModel.getGroupRolesForUsers(
                dashboard.uuid,
                userUuids,
                dashboard.organizationUuid,
            ),
            this.spacePermissionService.getSpaceAccessContextForUsers(
                userUuids,
                dashboard.spaceUuid,
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

    async listAccess({
        user,
        projectUuid,
        resourceUuid,
        paginateArgs,
        filters,
    }: DashboardAccessInput & {
        paginateArgs?: KnexPaginateArgs;
        filters?: DirectAccessListFilters;
    }): Promise<DirectAccessList> {
        const dashboard = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        const { data, pagination } =
            await this.dashboardAccessModel.getDirectAccessList(
                dashboard.uuid,
                dashboard.organizationUuid,
                {
                    paginateArgs: paginateArgs ?? DEFAULT_ACCESS_LIST_PAGE,
                    searchQuery: filters?.searchQuery,
                },
            );
        return {
            data: await this.resolveGrants(dashboard, data),
            ...(pagination ? { pagination } : {}),
        };
    }

    async replaceUserRole({
        user,
        projectUuid,
        resourceUuid,
        userUuid,
        role,
    }: DashboardAccessInput & {
        userUuid: string;
        role: SpaceMemberRole;
    }): Promise<DirectAccessGrant> {
        const dashboard = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        await this.directAccessService.upsertUserAccess({
            user,
            resource: { type: 'dashboard', uuid: dashboard.uuid },
            userUuid,
            role,
        });
        return this.getGrant(dashboard, {
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
    }: DashboardAccessInput & {
        groupUuid: string;
        role: SpaceMemberRole;
    }): Promise<DirectAccessGrant> {
        const dashboard = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        await this.directAccessService.upsertGroupAccess({
            user,
            resource: { type: 'dashboard', uuid: dashboard.uuid },
            groupUuid,
            role,
        });
        return this.getGrant(dashboard, {
            origin: DirectAccessOrigin.GROUP,
            uuid: groupUuid,
        });
    }

    async revokeUser({
        user,
        projectUuid,
        resourceUuid,
        userUuid,
    }: DashboardAccessInput & { userUuid: string }): Promise<void> {
        const input = { user, projectUuid, resourceUuid };
        const dashboard =
            userUuid === user.userUuid
                ? await this.resolveDashboard(input)
                : await this.assertAdmin(input);
        await this.directAccessService.revokeUserAccess({
            user,
            resource: { type: 'dashboard', uuid: dashboard.uuid },
            userUuid,
        });
    }

    async revokeGroup({
        user,
        projectUuid,
        resourceUuid,
        groupUuid,
    }: DashboardAccessInput & { groupUuid: string }): Promise<void> {
        const dashboard = await this.assertAdmin({
            user,
            projectUuid,
            resourceUuid,
        });
        await this.directAccessService.revokeGroupAccess({
            user,
            resource: { type: 'dashboard', uuid: dashboard.uuid },
            groupUuid,
        });
    }

    async reset(input: DashboardAccessInput): Promise<void> {
        const dashboard = await this.assertAdmin(input);
        await this.directAccessService.resetAccess({
            user: input.user,
            resource: { type: 'dashboard', uuid: dashboard.uuid },
        });
    }
}
