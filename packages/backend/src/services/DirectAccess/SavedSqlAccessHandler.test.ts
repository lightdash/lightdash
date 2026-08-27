import { Ability } from '@casl/ability';
import {
    DirectAccessOrigin,
    ForbiddenError,
    OrganizationMemberRole,
    SpaceMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { SavedSqlAccessModel } from '../../models/SavedSqlAccessModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import type { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import { SavedSqlAccessHandler } from './SavedSqlAccessHandler';

const organizationUuid = '8d4ee021-2dc9-4955-b349-711cc36125be';
const projectUuid = 'b6735fb8-e57a-44af-a7d6-768bb9d3f87b';
const savedSqlUuid = '154f3622-cb7d-4af7-9b48-c278aa2d5f95';
const spaceUuid = '59acec01-47a5-44d2-a62b-fb9a4c2dbd8b';
const adminUserUuid = 'e43891ac-dc01-4fcf-aad7-9e9eca697364';
const principalUserUuid = '77904c19-ddf4-4c4c-b477-b72325a8a7de';
const groupUuid = 'c81355f2-3cfe-4d89-8d65-acd8dc105210';

const makeUser = (
    abilityRules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
    userUuid = adminUserUuid,
): SessionUser =>
    ({
        userUuid,
        email: 'admin@example.com',
        firstName: 'Direct',
        lastName: 'Admin',
        organizationUuid,
        organizationName: 'Test org',
        organizationCreatedAt: new Date(),
        role: OrganizationMemberRole.MEMBER,
        ability: new Ability<PossibleAbilities>(abilityRules),
        abilityRules: [],
        isActive: true,
        userId: 1,
        avatarUrl: null,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        createdAt: new Date(),
        updatedAt: new Date(),
    }) as unknown as SessionUser;

const adminUser = makeUser([
    { subject: 'SavedChart', action: ['view', 'manage'] },
]);
const viewerUser = makeUser(
    [{ subject: 'SavedChart', action: 'view' }],
    principalUserUuid,
);

const savedSql = {
    savedSqlUuid,
    dashboard: null,
    space: { uuid: spaceUuid, name: 'Private' },
    project: { projectUuid },
    organization: { organizationUuid },
};
const mutationExpectation = {
    organizationUuid,
    projectUuid,
    spaceUuid,
    dashboardUuid: null,
};

const adminAccessContext = {
    organizationUuid,
    projectUuid,
    inheritsFromOrgOrProject: false,
    access: [
        {
            userUuid: adminUserUuid,
            role: SpaceMemberRole.ADMIN,
            hasDirectAccess: true,
            projectRole: undefined,
            inheritedRole: undefined,
            inheritedFrom: undefined,
            grantedVia: 'sql_chart' as const,
        },
    ],
    admins: [],
    directOnly: true,
};

const userRow = {
    origin: DirectAccessOrigin.USER as const,
    principalUuid: principalUserUuid,
    firstName: 'Grant',
    lastName: 'Recipient',
    email: 'recipient@example.com',
    isInternal: false,
    name: null,
    directRole: SpaceMemberRole.VIEWER,
};
const groupRow = {
    origin: DirectAccessOrigin.GROUP as const,
    principalUuid: groupUuid,
    firstName: null,
    lastName: null,
    email: null,
    isInternal: null,
    name: 'Analysts',
    directRole: SpaceMemberRole.EDITOR,
};

const mutationResult = {
    organizationId: 1,
    organizationUuid,
    projectId: 2,
    projectUuid,
    beforeRole: null,
    afterRole: SpaceMemberRole.VIEWER,
};

describe('SavedSqlAccessHandler', () => {
    const featureGate = {
        isEnabledForUser: vi.fn(async () => true),
    };
    const savedSqlModel = {
        getByUuid: vi.fn(async () => savedSql),
    };
    const savedSqlAccessModel = {
        getDirectAccessList: vi.fn(
            async (
                _resourceUuid: string,
                _organizationUuid: string,
                options?: {
                    principal?: {
                        origin: DirectAccessOrigin;
                        uuid: string;
                    };
                },
            ) => ({
                data: options?.principal
                    ? [userRow, groupRow].filter(
                          (row) =>
                              row.origin === options.principal?.origin &&
                              row.principalUuid === options.principal.uuid,
                      )
                    : [userRow, groupRow],
                pagination: {
                    page: 1,
                    pageSize: 100,
                    totalPageCount: 1,
                    totalResults: 2,
                },
            }),
        ),
        getGroupRolesForUsers: vi.fn(async () => ({
            [principalUserUuid]: [SpaceMemberRole.EDITOR],
        })),
        upsertUserAccess: vi.fn(async () => mutationResult),
        upsertGroupAccess: vi.fn(async () => ({
            ...mutationResult,
            afterRole: SpaceMemberRole.EDITOR,
        })),
        revokeUserAccess: vi.fn(async () => ({
            ...mutationResult,
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: null,
        })),
        revokeGroupAccess: vi.fn(async () => ({
            ...mutationResult,
            beforeRole: SpaceMemberRole.EDITOR,
            afterRole: null,
        })),
        resetAccess: vi.fn(async () => ({
            organizationId: 1,
            organizationUuid,
            projectId: 2,
            projectUuid,
            revokedUsers: 1,
            revokedGroups: 1,
        })),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn(async () => adminAccessContext),
        getSpaceAccessContextForUsers: vi.fn(async () => ({
            ...adminAccessContext,
            access: [],
        })),
        mergeAdminAccess: vi.fn(
            (context: { access: typeof adminAccessContext.access }) =>
                context.access,
        ),
    };
    const auditLogger = vi.fn();

    const handler = new SavedSqlAccessHandler({
        savedSqlAccessModel:
            savedSqlAccessModel as unknown as SavedSqlAccessModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        featureGate: featureGate as unknown as DirectAccessFeatureGate,
        auditLogger,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        featureGate.isEnabledForUser.mockResolvedValue(true);
        savedSqlModel.getByUuid.mockResolvedValue(savedSql);
        spacePermissionService.resolveAccess.mockResolvedValue(
            adminAccessContext,
        );
    });

    it('lists direct and effective roles with bounded pagination', async () => {
        await expect(
            handler.listAccess({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
                filters: { searchQuery: 'grant' },
            }),
        ).resolves.toMatchObject({
            data: [
                {
                    principal: {
                        type: DirectAccessOrigin.USER,
                        uuid: principalUserUuid,
                    },
                    directRole: SpaceMemberRole.VIEWER,
                    effectiveRole: SpaceMemberRole.EDITOR,
                },
                {
                    principal: {
                        type: DirectAccessOrigin.GROUP,
                        uuid: groupUuid,
                    },
                    directRole: SpaceMemberRole.EDITOR,
                },
            ],
        });
        expect(savedSqlAccessModel.getDirectAccessList).toHaveBeenCalledWith(
            savedSqlUuid,
            organizationUuid,
            {
                paginateArgs: { page: 1, pageSize: 100 },
                searchQuery: 'grant',
            },
        );
        expect(
            spacePermissionService.getSpaceAccessContextForUsers,
        ).toHaveBeenCalledWith([principalUserUuid], spaceUuid);
    });

    it('reports admin as the effective role when a lower access row exists', async () => {
        spacePermissionService.getSpaceAccessContextForUsers.mockResolvedValueOnce(
            {
                ...adminAccessContext,
                access: [
                    {
                        ...adminAccessContext.access[0],
                        userUuid: principalUserUuid,
                        role: SpaceMemberRole.VIEWER,
                    },
                ],
                admins: [{ userUuid: principalUserUuid }],
            } as never,
        );

        await expect(
            handler.listAccess({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
            }),
        ).resolves.toMatchObject({
            data: [
                {
                    principal: { uuid: principalUserUuid },
                    effectiveRole: SpaceMemberRole.ADMIN,
                },
                expect.anything(),
            ],
        });
    });

    it('replaces a user role and emits a grant audit event', async () => {
        await expect(
            handler.replaceUserRole({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
                userUuid: principalUserUuid,
                role: SpaceMemberRole.VIEWER,
            }),
        ).resolves.toMatchObject({
            principal: { uuid: principalUserUuid },
            directRole: SpaceMemberRole.VIEWER,
        });
        expect(savedSqlAccessModel.upsertUserAccess).toHaveBeenCalledWith({
            resourceUuid: savedSqlUuid,
            userUuid: principalUserUuid,
            role: SpaceMemberRole.VIEWER,
            grantedByUserUuid: adminUserUuid,
            ...mutationExpectation,
        });
        expect(auditLogger).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'direct_access.grant' }),
        );
    });

    it('replaces a group role and returns the group grant', async () => {
        await expect(
            handler.replaceGroupRole({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
                groupUuid,
                role: SpaceMemberRole.EDITOR,
            }),
        ).resolves.toMatchObject({
            principal: { type: DirectAccessOrigin.GROUP, uuid: groupUuid },
            directRole: SpaceMemberRole.EDITOR,
        });
        expect(savedSqlAccessModel.upsertGroupAccess).toHaveBeenCalledWith({
            resourceUuid: savedSqlUuid,
            groupUuid,
            role: SpaceMemberRole.EDITOR,
            grantedByUserUuid: adminUserUuid,
            ...mutationExpectation,
        });
    });

    it('allows a viewer to revoke their own grant', async () => {
        spacePermissionService.resolveAccess.mockResolvedValue({
            ...adminAccessContext,
            access: [
                {
                    ...adminAccessContext.access[0],
                    userUuid: principalUserUuid,
                    role: SpaceMemberRole.VIEWER,
                },
            ],
        });

        await expect(
            handler.revokeUser({
                user: viewerUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
                userUuid: principalUserUuid,
            }),
        ).resolves.toBeUndefined();
        expect(savedSqlAccessModel.revokeUserAccess).toHaveBeenCalled();
    });

    it('requires effective admin role to mutate another principal', async () => {
        spacePermissionService.resolveAccess.mockResolvedValue({
            ...adminAccessContext,
            access: [
                {
                    ...adminAccessContext.access[0],
                    role: SpaceMemberRole.EDITOR,
                },
            ],
        });

        await expect(
            handler.revokeUser({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
                userUuid: principalUserUuid,
            }),
        ).rejects.toThrow('Admin access is required');
        expect(savedSqlAccessModel.revokeUserAccess).not.toHaveBeenCalled();
    });

    it('requires the current SavedChart capability for an admin grant', async () => {
        const roleOnlyAdmin = makeUser([
            { subject: 'SavedChart', action: 'view' },
        ]);

        await expect(
            handler.reset({
                user: roleOnlyAdmin,
                projectUuid,
                resourceUuid: savedSqlUuid,
            }),
        ).rejects.toThrow('Admin access is required');
        expect(savedSqlAccessModel.resetAccess).not.toHaveBeenCalled();
    });

    it('revokes group access and resets all grants as an admin', async () => {
        await handler.revokeGroup({
            user: adminUser,
            projectUuid,
            resourceUuid: savedSqlUuid,
            groupUuid,
        });
        await handler.reset({
            user: adminUser,
            projectUuid,
            resourceUuid: savedSqlUuid,
        });

        expect(savedSqlAccessModel.revokeGroupAccess).toHaveBeenCalled();
        expect(savedSqlAccessModel.resetAccess).toHaveBeenCalled();
        expect(auditLogger).toHaveBeenCalledTimes(2);
    });

    it('keeps a missing-grant revoke idempotent without a phantom audit', async () => {
        savedSqlAccessModel.revokeUserAccess.mockResolvedValueOnce({
            ...mutationResult,
            beforeRole: null,
            afterRole: null,
        } as never);

        await handler.revokeUser({
            user: adminUser,
            projectUuid,
            resourceUuid: savedSqlUuid,
            userUuid: principalUserUuid,
        });

        expect(savedSqlAccessModel.revokeUserAccess).toHaveBeenCalled();
        expect(auditLogger).not.toHaveBeenCalled();
    });

    it('fails closed before target lookup when the feature is disabled', async () => {
        featureGate.isEnabledForUser.mockResolvedValue(false);

        await expect(
            handler.listAccess({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(savedSqlModel.getByUuid).not.toHaveBeenCalled();
    });

    it('normalizes malformed, inaccessible, and dashboard-owned targets', async () => {
        await expect(
            handler.listAccess({
                user: adminUser,
                projectUuid,
                resourceUuid: 'not-a-uuid',
            }),
        ).rejects.toThrow('Access target not found');

        savedSqlModel.getByUuid.mockRejectedValueOnce(new ForbiddenError());
        await expect(
            handler.listAccess({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
            }),
        ).rejects.toThrow('Access target not found');

        savedSqlModel.getByUuid.mockResolvedValueOnce({
            ...savedSql,
            dashboard: { uuid: 'dashboard-uuid', name: 'Dashboard' },
        } as never);
        await expect(
            handler.listAccess({
                user: adminUser,
                projectUuid,
                resourceUuid: savedSqlUuid,
            }),
        ).rejects.toThrow('Access target not found');
    });
});
