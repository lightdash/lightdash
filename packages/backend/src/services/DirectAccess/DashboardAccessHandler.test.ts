import {
    DirectAccessOrigin,
    ForbiddenError,
    NotFoundError,
    SpaceMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    type DashboardAccessModel,
    type DashboardDirectAccessListRow,
} from '../../models/DashboardAccessModel';
import { type DashboardService } from '../DashboardService/DashboardService';
import { type SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { DashboardAccessHandler } from './DashboardAccessHandler';
import { type DirectAccessService } from './DirectAccessService';

const dashboardUuid = '11111111-1111-4111-8111-111111111111';
const projectUuid = '22222222-2222-4222-8222-222222222222';
const organizationUuid = '33333333-3333-4333-8333-333333333333';
const spaceUuid = '44444444-4444-4444-8444-444444444444';
const actorUuid = '55555555-5555-4555-8555-555555555555';

const user = {
    organizationUuid,
    userUuid: actorUuid,
} as unknown as SessionUser;

const dashboard = {
    uuid: dashboardUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    access: [{ userUuid: actorUuid, role: SpaceMemberRole.ADMIN }],
};

const userRow: DashboardDirectAccessListRow = {
    origin: DirectAccessOrigin.USER,
    principalUuid: 'user-uuid',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    isInternal: false,
    name: null,
    directRole: SpaceMemberRole.VIEWER,
};

const groupRow: DashboardDirectAccessListRow = {
    origin: DirectAccessOrigin.GROUP,
    principalUuid: 'group-uuid',
    firstName: null,
    lastName: null,
    email: null,
    isInternal: null,
    name: 'Analysts',
    directRole: SpaceMemberRole.EDITOR,
};

const createMocks = () => {
    const dashboardAccessModel = {
        getDirectAccessList: vi.fn().mockResolvedValue({
            data: [userRow, groupRow],
            pagination: {
                page: 1,
                pageSize: 20,
                totalPageCount: 1,
                totalResults: 2,
            },
        }),
        getGroupRolesForUsers: vi.fn().mockResolvedValue({
            'user-uuid': [SpaceMemberRole.EDITOR],
        }),
    } as unknown as DashboardAccessModel;
    const dashboardService = {
        assertViewAccess: vi.fn().mockResolvedValue(dashboard),
    } as unknown as DashboardService;
    const directAccessService = {
        assertEnabled: vi.fn().mockResolvedValue(undefined),
        upsertUserAccess: vi.fn().mockResolvedValue(undefined),
        upsertGroupAccess: vi.fn().mockResolvedValue(undefined),
        revokeUserAccess: vi.fn().mockResolvedValue(undefined),
        revokeGroupAccess: vi.fn().mockResolvedValue(undefined),
        resetAccess: vi.fn().mockResolvedValue(undefined),
    } as unknown as DirectAccessService;
    const spacePermissionService = {
        mergeAdminAccess: vi.fn(
            (context: { access: unknown[] }) => context.access,
        ),
        getSpaceAccessContextForUsers: vi.fn().mockResolvedValue({
            access: [
                {
                    userUuid: 'user-uuid',
                    role: SpaceMemberRole.VIEWER,
                },
            ],
            admins: [],
        }),
    } as unknown as SpacePermissionService;

    return {
        dashboardAccessModel,
        dashboardService,
        directAccessService,
        spacePermissionService,
        handler: new DashboardAccessHandler({
            dashboardAccessModel,
            dashboardService,
            directAccessService,
            spacePermissionService,
        }),
    };
};

describe('DashboardAccessHandler', () => {
    let mocks: ReturnType<typeof createMocks>;

    beforeEach(() => {
        mocks = createMocks();
    });

    it('normalizes invalid, unknown, mismatched, and inaccessible resources', async () => {
        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: 'dashboard-slug',
            }),
        ).rejects.toEqual(new NotFoundError('Access target not found'));
        expect(mocks.dashboardService.assertViewAccess).not.toHaveBeenCalled();

        vi.mocked(
            mocks.dashboardService.assertViewAccess,
        ).mockRejectedValueOnce(new NotFoundError('Dashboard not found'));
        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).rejects.toEqual(new NotFoundError('Access target not found'));

        vi.mocked(
            mocks.dashboardService.assertViewAccess,
        ).mockRejectedValueOnce(new ForbiddenError());
        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).rejects.toEqual(new NotFoundError('Access target not found'));
    });

    it('requires effective dashboard admin access', async () => {
        vi.mocked(
            mocks.dashboardService.assertViewAccess,
        ).mockResolvedValueOnce({
            ...dashboard,
            access: [{ userUuid: actorUuid, role: SpaceMemberRole.EDITOR }],
        } as never);

        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).rejects.toEqual(new ForbiddenError('Admin access is required'));
    });

    it('fails closed before resolving a dashboard when direct access is unavailable', async () => {
        const unavailable = new ForbiddenError('Direct access unavailable');
        vi.mocked(
            mocks.directAccessService.assertEnabled,
        ).mockRejectedValueOnce(unavailable);

        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).rejects.toBe(unavailable);
        expect(mocks.dashboardService.assertViewAccess).not.toHaveBeenCalled();
        expect(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).not.toHaveBeenCalled();
    });

    it('returns paginated direct principals with additive effective roles', async () => {
        const result = await mocks.handler.listAccess({
            user,
            projectUuid,
            resourceUuid: dashboardUuid,
            paginateArgs: { page: 1, pageSize: 20 },
            filters: { searchQuery: 'ada' },
        });

        expect(result).toEqual({
            data: [
                {
                    principal: {
                        type: DirectAccessOrigin.USER,
                        uuid: 'user-uuid',
                        firstName: 'Ada',
                        lastName: 'Lovelace',
                        email: 'ada@example.com',
                        isInternal: false,
                    },
                    directRole: SpaceMemberRole.VIEWER,
                    effectiveRole: SpaceMemberRole.EDITOR,
                },
                {
                    principal: {
                        type: DirectAccessOrigin.GROUP,
                        uuid: 'group-uuid',
                        name: 'Analysts',
                    },
                    directRole: SpaceMemberRole.EDITOR,
                },
            ],
            pagination: {
                page: 1,
                pageSize: 20,
                totalPageCount: 1,
                totalResults: 2,
            },
        });
        expect(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).toHaveBeenCalledWith(dashboardUuid, organizationUuid, {
            paginateArgs: { page: 1, pageSize: 20 },
            searchQuery: 'ada',
        });
        expect(mocks.dashboardService.assertViewAccess).toHaveBeenCalledWith(
            user,
            dashboardUuid,
            {
                projectUuid,
                includeDependencies: false,
                strictUuid: true,
            },
        );
        expect(
            mocks.dashboardAccessModel.getGroupRolesForUsers,
        ).toHaveBeenCalledWith(dashboardUuid, ['user-uuid'], organizationUuid);
        expect(
            mocks.spacePermissionService.getSpaceAccessContextForUsers,
        ).toHaveBeenCalledWith(['user-uuid'], spaceUuid);
        expect(mocks.directAccessService.assertEnabled).toHaveBeenCalledWith(
            user,
        );
    });

    it('uses logical access when it is the highest user role', async () => {
        vi.mocked(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).mockResolvedValueOnce({ data: [userRow] });
        vi.mocked(
            mocks.dashboardAccessModel.getGroupRolesForUsers,
        ).mockResolvedValueOnce({
            'user-uuid': [SpaceMemberRole.VIEWER],
        });
        vi.mocked(
            mocks.spacePermissionService.getSpaceAccessContextForUsers,
        ).mockResolvedValueOnce({
            access: [
                {
                    userUuid: 'user-uuid',
                    role: SpaceMemberRole.ADMIN,
                },
            ],
            admins: [],
        } as never);

        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).resolves.toMatchObject({
            data: [{ effectiveRole: SpaceMemberRole.ADMIN }],
        });
    });

    it('does not resolve user access for group-only pages', async () => {
        vi.mocked(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).mockResolvedValueOnce({ data: [groupRow] });

        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).resolves.toMatchObject({
            data: [{ principal: { type: DirectAccessOrigin.GROUP } }],
        });
        expect(
            mocks.dashboardAccessModel.getGroupRolesForUsers,
        ).not.toHaveBeenCalled();
        expect(
            mocks.spacePermissionService.getSpaceAccessContextForUsers,
        ).not.toHaveBeenCalled();
    });

    it('replaces user and group roles through the direct-access service', async () => {
        vi.mocked(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).mockResolvedValueOnce({
            data: [{ ...userRow, directRole: SpaceMemberRole.EDITOR }],
        });
        await expect(
            mocks.handler.replaceUserRole({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
                userUuid: 'user-uuid',
                role: SpaceMemberRole.EDITOR,
            }),
        ).resolves.toMatchObject({
            principal: { uuid: 'user-uuid' },
            directRole: SpaceMemberRole.EDITOR,
        });
        expect(mocks.directAccessService.upsertUserAccess).toHaveBeenCalledWith(
            {
                user,
                resource: { type: 'dashboard', uuid: dashboardUuid },
                userUuid: 'user-uuid',
                role: SpaceMemberRole.EDITOR,
            },
        );

        vi.mocked(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).mockResolvedValueOnce({
            data: [{ ...groupRow, directRole: SpaceMemberRole.ADMIN }],
        });
        await mocks.handler.replaceGroupRole({
            user,
            projectUuid,
            resourceUuid: dashboardUuid,
            groupUuid: 'group-uuid',
            role: SpaceMemberRole.ADMIN,
        });
        expect(
            mocks.directAccessService.upsertGroupAccess,
        ).toHaveBeenCalledWith({
            user,
            resource: { type: 'dashboard', uuid: dashboardUuid },
            groupUuid: 'group-uuid',
            role: SpaceMemberRole.ADMIN,
        });
    });

    it('delegates idempotent revoke and reset operations', async () => {
        await mocks.handler.revokeUser({
            user,
            projectUuid,
            resourceUuid: dashboardUuid,
            userUuid: 'user-uuid',
        });
        await mocks.handler.revokeGroup({
            user,
            projectUuid,
            resourceUuid: dashboardUuid,
            groupUuid: 'group-uuid',
        });
        await mocks.handler.reset({
            user,
            projectUuid,
            resourceUuid: dashboardUuid,
        });

        expect(mocks.directAccessService.revokeUserAccess).toHaveBeenCalledWith(
            {
                user,
                resource: { type: 'dashboard', uuid: dashboardUuid },
                userUuid: 'user-uuid',
            },
        );
        expect(
            mocks.directAccessService.revokeGroupAccess,
        ).toHaveBeenCalledWith({
            user,
            resource: { type: 'dashboard', uuid: dashboardUuid },
            groupUuid: 'group-uuid',
        });
        expect(mocks.directAccessService.resetAccess).toHaveBeenCalledWith({
            user,
            resource: { type: 'dashboard', uuid: dashboardUuid },
        });
    });

    it('allows a non-admin to revoke their own direct grant', async () => {
        vi.mocked(
            mocks.dashboardService.assertViewAccess,
        ).mockResolvedValueOnce({
            ...dashboard,
            access: [{ userUuid: actorUuid, role: SpaceMemberRole.VIEWER }],
        } as never);

        await mocks.handler.revokeUser({
            user,
            projectUuid,
            resourceUuid: dashboardUuid,
            userUuid: actorUuid,
        });

        expect(mocks.directAccessService.revokeUserAccess).toHaveBeenCalledWith(
            {
                user,
                resource: { type: 'dashboard', uuid: dashboardUuid },
                userUuid: actorUuid,
            },
        );
    });

    it('denies every administrative mutation to non-admins', async () => {
        vi.mocked(mocks.dashboardService.assertViewAccess).mockResolvedValue({
            ...dashboard,
            access: [{ userUuid: actorUuid, role: SpaceMemberRole.EDITOR }],
        } as never);

        const results = await Promise.allSettled([
            mocks.handler.replaceUserRole({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
                userUuid: 'user-uuid',
                role: SpaceMemberRole.VIEWER,
            }),
            mocks.handler.replaceGroupRole({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
                groupUuid: 'group-uuid',
                role: SpaceMemberRole.VIEWER,
            }),
            mocks.handler.revokeUser({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
                userUuid: 'other-user-uuid',
            }),
            mocks.handler.revokeGroup({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
                groupUuid: 'group-uuid',
            }),
            mocks.handler.reset({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ]);

        expect(results).toHaveLength(5);
        expect(
            results.every(
                (result) =>
                    result.status === 'rejected' &&
                    result.reason instanceof ForbiddenError,
            ),
        ).toBe(true);
        expect(
            mocks.directAccessService.upsertUserAccess,
        ).not.toHaveBeenCalled();
        expect(
            mocks.directAccessService.upsertGroupAccess,
        ).not.toHaveBeenCalled();
        expect(
            mocks.directAccessService.revokeUserAccess,
        ).not.toHaveBeenCalled();
        expect(
            mocks.directAccessService.revokeGroupAccess,
        ).not.toHaveBeenCalled();
        expect(mocks.directAccessService.resetAccess).not.toHaveBeenCalled();
    });

    it('grants administration to org and project admins without space access', async () => {
        vi.mocked(mocks.dashboardService.assertViewAccess).mockResolvedValue({
            ...dashboard,
            access: [],
        } as never);
        vi.mocked(
            mocks.spacePermissionService.getSpaceAccessContextForUsers,
        ).mockResolvedValue({
            access: [],
            admins: [{ userUuid: actorUuid, source: 'organization' }],
        } as never);

        await expect(
            mocks.handler.listAccess({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
            }),
        ).resolves.toMatchObject({ data: expect.any(Array) });
        expect(
            mocks.spacePermissionService.getSpaceAccessContextForUsers,
        ).toHaveBeenCalledWith([actorUuid], spaceUuid);
        expect(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).toHaveBeenCalledWith(dashboardUuid, organizationUuid, {
            paginateArgs: { page: 1, pageSize: 100 },
            searchQuery: undefined,
        });
    });

    it('throws when the replaced grant cannot be read back', async () => {
        vi.mocked(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).mockResolvedValueOnce({ data: [] });

        await expect(
            mocks.handler.replaceUserRole({
                user,
                projectUuid,
                resourceUuid: dashboardUuid,
                userUuid: 'user-uuid',
                role: SpaceMemberRole.EDITOR,
            }),
        ).rejects.toEqual(new NotFoundError('Direct access grant not found'));
        expect(
            mocks.dashboardAccessModel.getDirectAccessList,
        ).toHaveBeenCalledWith(dashboardUuid, organizationUuid, {
            principal: { origin: DirectAccessOrigin.USER, uuid: 'user-uuid' },
        });
    });
});
