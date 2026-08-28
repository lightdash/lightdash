import {
    defineUserAbility,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    ForbiddenError,
    OrganizationMemberRole,
    SpaceMemberRole,
    type RegisteredAccount,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logAuditEvent } from '../../logging/winston';
import { type DirectAccessModel } from '../../models/DirectAccessModel';
import { type SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { type DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import { DirectAccessService } from './DirectAccessService';

vi.mock('../../logging/winston', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    logAuditEvent: vi.fn(),
}));

const ORGANIZATION_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROJECT_UUID = 'aaaaaaaa-0000-0000-0000-000000000002';
const SPACE_UUID = 'aaaaaaaa-0000-0000-0000-000000000003';
const DASHBOARD_UUID = 'aaaaaaaa-0000-0000-0000-000000000004';
const APP_UUID = 'aaaaaaaa-0000-0000-0000-000000000005';
const USER_UUID = 'aaaaaaaa-0000-0000-0000-000000000006';
const OTHER_USER_UUID = 'aaaaaaaa-0000-0000-0000-000000000007';

const buildAccount = (
    role: OrganizationMemberRole,
    userUuid: string = USER_UUID,
): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid: ORGANIZATION_UUID },
        user: {
            id: userUuid,
            userUuid,
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            role,
            ability: defineUserAbility(
                {
                    role,
                    organizationUuid: ORGANIZATION_UUID,
                    userUuid,
                    roleUuid: undefined,
                },
                [],
            ),
        },
        isAnonymousUser: () => false,
        isServiceAccount: () => false,
    }) as unknown as RegisteredAccount;

const spaceContext = (
    access: { userUuid: string; role: SpaceMemberRole }[],
) => ({
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    inheritsFromOrgOrProject: false,
    access: access.map((entry) => ({
        ...entry,
        hasDirectAccess: true,
        projectRole: undefined,
        inheritedRole: undefined,
        inheritedFrom: undefined,
    })),
    admins: [],
    directOnly: false,
});

const dashboardLocation = {
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    spaceUuid: SPACE_UUID,
    dashboardUuid: null,
    createdByUserUuid: null,
};

const personalAppLocation = {
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    spaceUuid: null,
    dashboardUuid: null,
    createdByUserUuid: USER_UUID,
};

const buildService = ({
    enabled = true,
    location = dashboardLocation,
    context = spaceContext([]),
}: {
    enabled?: boolean;
    // null = the model cannot locate the resource
    location?: typeof dashboardLocation | typeof personalAppLocation | null;
    context?: ReturnType<typeof spaceContext>;
} = {}) => {
    const directAccessModel = {
        findResourceLocation: vi.fn().mockResolvedValue(location ?? undefined),
        listAssignments: vi.fn().mockResolvedValue([]),
        upsertAccess: vi.fn().mockResolvedValue({
            organizationId: 1,
            organizationUuid: ORGANIZATION_UUID,
            projectId: 1,
            projectUuid: PROJECT_UUID,
            beforeRole: null,
            afterRole: SpaceMemberRole.VIEWER,
        }),
        revokeAccess: vi.fn().mockResolvedValue({
            organizationId: 1,
            organizationUuid: ORGANIZATION_UUID,
            projectId: 1,
            projectUuid: PROJECT_UUID,
            beforeRole: null,
            afterRole: null,
        }),
        resetAccess: vi.fn().mockResolvedValue({
            organizationId: 1,
            organizationUuid: ORGANIZATION_UUID,
            projectId: 1,
            projectUuid: PROJECT_UUID,
            revokedUsers: 1,
            revokedGroups: 0,
        }),
    };
    const directAccessFeatureGate = {
        assertEnabled: enabled
            ? vi.fn().mockResolvedValue(undefined)
            : vi
                  .fn()
                  .mockRejectedValue(
                      new ForbiddenError('Direct access is not available'),
                  ),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue(context),
    };
    const service = new DirectAccessService({
        directAccessModel: directAccessModel as unknown as DirectAccessModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        directAccessFeatureGate:
            directAccessFeatureGate as unknown as DirectAccessFeatureGate,
    });
    return {
        service,
        directAccessModel,
        directAccessFeatureGate,
        spacePermissionService,
    };
};

describe('DirectAccessService', () => {
    beforeEach(() => {
        vi.mocked(logAuditEvent).mockClear();
    });

    it('fails closed before touching the model when the feature is unavailable', async () => {
        const { service, directAccessModel } = buildService({ enabled: false });
        await expect(
            service.listAssignments(
                buildAccount(OrganizationMemberRole.ADMIN),
                PROJECT_UUID,
                DirectAccessResourceType.DASHBOARD,
                DASHBOARD_UUID,
            ),
        ).rejects.toThrowError(ForbiddenError);
        expect(directAccessModel.findResourceLocation).not.toHaveBeenCalled();
    });

    it('returns not-found for unknown resources and wrong projects', async () => {
        const missing = buildService({ location: null });
        await expect(
            missing.service.listAssignments(
                buildAccount(OrganizationMemberRole.ADMIN),
                PROJECT_UUID,
                DirectAccessResourceType.DASHBOARD,
                DASHBOARD_UUID,
            ),
        ).rejects.toMatchObject({ name: 'NotFoundError' });

        const wrongProject = buildService();
        await expect(
            wrongProject.service.listAssignments(
                buildAccount(OrganizationMemberRole.ADMIN),
                'aaaaaaaa-0000-0000-0000-00000000000f',
                DirectAccessResourceType.DASHBOARD,
                DASHBOARD_UUID,
            ),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
        expect(
            wrongProject.directAccessModel.listAssignments,
        ).not.toHaveBeenCalled();
    });

    it('denies members without admin standing over the resolved context', async () => {
        const editorGrantOnly = buildService({
            context: spaceContext([
                { userUuid: USER_UUID, role: SpaceMemberRole.EDITOR },
            ]),
        });
        await expect(
            editorGrantOnly.service.listAssignments(
                buildAccount(OrganizationMemberRole.INTERACTIVE_VIEWER),
                PROJECT_UUID,
                DirectAccessResourceType.DASHBOARD,
                DASHBOARD_UUID,
            ),
        ).rejects.toThrowError(ForbiddenError);
    });

    it('authorizes admin-role access rows in the resolved context', async () => {
        const { service, directAccessModel, spacePermissionService } =
            buildService({
                context: spaceContext([
                    { userUuid: USER_UUID, role: SpaceMemberRole.ADMIN },
                ]),
            });
        await expect(
            service.listAssignments(
                buildAccount(OrganizationMemberRole.INTERACTIVE_VIEWER),
                PROJECT_UUID,
                DirectAccessResourceType.DASHBOARD,
                DASHBOARD_UUID,
            ),
        ).resolves.toEqual([]);
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            USER_UUID,
            {
                type: 'dashboard',
                dashboardUuid: DASHBOARD_UUID,
                spaceUuid: SPACE_UUID,
            },
        );
        expect(directAccessModel.listAssignments).toHaveBeenCalledWith({
            resourceType: DirectAccessResourceType.DASHBOARD,
            resourceUuid: DASHBOARD_UUID,
            organizationUuid: ORGANIZATION_UUID,
        });
    });

    it('recovers organization admins with no access rows at all', async () => {
        const { service } = buildService({ context: spaceContext([]) });
        await expect(
            service.listAssignments(
                buildAccount(OrganizationMemberRole.ADMIN),
                PROJECT_UUID,
                DirectAccessResourceType.DASHBOARD,
                DASHBOARD_UUID,
            ),
        ).resolves.toEqual([]);
    });

    it('lets a personal app creator manage its policy but not other members', async () => {
        const creator = buildService({ location: personalAppLocation });
        await expect(
            creator.service.listAssignments(
                buildAccount(OrganizationMemberRole.INTERACTIVE_VIEWER),
                PROJECT_UUID,
                DirectAccessResourceType.APP,
                APP_UUID,
            ),
        ).resolves.toEqual([]);
        expect(
            creator.spacePermissionService.resolveAccess,
        ).toHaveBeenCalledWith(USER_UUID, {
            type: 'app',
            appUuid: APP_UUID,
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            spaceUuid: null,
        });

        const other = buildService({ location: personalAppLocation });
        await expect(
            other.service.listAssignments(
                buildAccount(
                    OrganizationMemberRole.INTERACTIVE_VIEWER,
                    OTHER_USER_UUID,
                ),
                PROJECT_UUID,
                DirectAccessResourceType.APP,
                APP_UUID,
            ),
        ).rejects.toThrowError(ForbiddenError);

        const admin = buildService({ location: personalAppLocation });
        await expect(
            admin.service.listAssignments(
                buildAccount(OrganizationMemberRole.ADMIN, OTHER_USER_UUID),
                PROJECT_UUID,
                DirectAccessResourceType.APP,
                APP_UUID,
            ),
        ).resolves.toEqual([]);
    });

    it('audits committed upserts and skips no-op revokes', async () => {
        const { service, directAccessModel } = buildService();
        const account = buildAccount(OrganizationMemberRole.ADMIN);

        await service.upsertAssignment(
            account,
            PROJECT_UUID,
            DirectAccessResourceType.DASHBOARD,
            DASHBOARD_UUID,
            { type: DirectAccessPrincipalType.USER, uuid: OTHER_USER_UUID },
            SpaceMemberRole.VIEWER,
        );
        expect(directAccessModel.upsertAccess).toHaveBeenCalledWith({
            resourceType: DirectAccessResourceType.DASHBOARD,
            resourceUuid: DASHBOARD_UUID,
            principal: {
                type: DirectAccessPrincipalType.USER,
                uuid: OTHER_USER_UUID,
            },
            role: SpaceMemberRole.VIEWER,
            organizationUuid: ORGANIZATION_UUID,
            grantedByUserUuid: USER_UUID,
        });
        const directAccessEvents = vi
            .mocked(logAuditEvent)
            .mock.calls.map(([event]) => event)
            .filter((event) => event.action.startsWith('direct_access.'));
        expect(directAccessEvents).toHaveLength(1);
        expect(directAccessEvents[0]).toEqual(
            expect.objectContaining({
                action: 'direct_access.grant',
                resource: expect.objectContaining({
                    type: DirectAccessResourceType.DASHBOARD,
                    metadata: expect.objectContaining({
                        resourceUuid: DASHBOARD_UUID,
                        principalType: 'user',
                        principalUuid: OTHER_USER_UUID,
                        beforeRole: null,
                        afterRole: SpaceMemberRole.VIEWER,
                    }),
                }),
            }),
        );

        vi.mocked(logAuditEvent).mockClear();
        await service.revokeAssignment(
            account,
            PROJECT_UUID,
            DirectAccessResourceType.DASHBOARD,
            DASHBOARD_UUID,
            { type: DirectAccessPrincipalType.USER, uuid: OTHER_USER_UUID },
        );
        expect(
            vi
                .mocked(logAuditEvent)
                .mock.calls.map(([event]) => event)
                .filter((event) => event.action.startsWith('direct_access.')),
        ).toHaveLength(0);
    });

    it('audits resets with revoked counts', async () => {
        const { service } = buildService();
        await service.resetAssignments(
            buildAccount(OrganizationMemberRole.ADMIN),
            PROJECT_UUID,
            DirectAccessResourceType.DASHBOARD,
            DASHBOARD_UUID,
        );
        const resetEvents = vi
            .mocked(logAuditEvent)
            .mock.calls.map(([event]) => event)
            .filter((event) => event.action.startsWith('direct_access.'));
        expect(resetEvents).toHaveLength(1);
        expect(resetEvents[0]).toEqual(
            expect.objectContaining({
                action: 'direct_access.reset',
                resource: expect.objectContaining({
                    metadata: expect.objectContaining({
                        revokedUsers: 1,
                        revokedGroups: 0,
                    }),
                }),
            }),
        );
    });
});
