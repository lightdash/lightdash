import {
    OrganizationMemberRole,
    SpaceMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SpacePermissionService } from './SpacePermissionService';
import { SpaceService } from './SpaceService';
import { createTestUser } from './SpaceService.mock';

describe('SpaceService.updateSpace - permission copy on inherit toggle', () => {
    const mockSpaceModel = {
        getSpaceSummary: jest.fn(),
        isRootSpace: jest.fn(),
        update: jest.fn(),
        updateWithCopiedPermissions: jest.fn(),
        addSpaceAccess: jest.fn(),
        get: jest.fn(),
        getSpaceBreadcrumbs: jest.fn(),
        getSpaceQueries: jest.fn(),
        getSpaceDashboards: jest.fn(),
        find: jest.fn(),
    };
    const mockSpacePermissionService = {
        can: jest.fn(),
        getAccessibleSpaceUuids: jest.fn(),
        getSpaceAccessContext: jest.fn(),
        getAllSpaceAccessContext: jest.fn(),
        getGroupAccess: jest.fn(),
        getUserMetadataByUuids: jest.fn(),
        getInheritedPermissionsToCopy: jest.fn(),
    };
    const mockUser = createTestUser({
        organizationRole: OrganizationMemberRole.ADMIN,
    });

    let service: SpaceService;

    beforeEach(() => {
        jest.resetAllMocks();

        service = new SpaceService({
            analytics: analyticsMock,
            lightdashConfig: lightdashConfigMock,
            projectModel: {} as ProjectModel,
            spaceModel: mockSpaceModel as unknown as SpaceModel,
            pinnedListModel: {} as PinnedListModel,
            spacePermissionService:
                mockSpacePermissionService as unknown as SpacePermissionService,
            savedChartService: {} as SavedChartService,
            dashboardService: {} as DashboardService,
        });

        // Default mocks
        mockSpacePermissionService.can.mockResolvedValue(true);
        // Return all requested UUIDs as accessible (admin user)
        mockSpacePermissionService.getAccessibleSpaceUuids.mockImplementation(
            (_action: string, _actor: unknown, uuids: string[]) =>
                Promise.resolve(uuids),
        );
        // Default: user has direct access (so auto-add doesn't fire)
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: true,
            access: [
                {
                    userUuid: mockUser.userUuid,
                    role: SpaceMemberRole.ADMIN,
                    hasDirectAccess: true,
                },
            ],
        });
        mockSpaceModel.get.mockResolvedValue({
            uuid: 'space-uuid',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            name: 'Test Space',
            inheritParentPermissions: true,
            slug: 'test-space',
            pinnedListUuid: null,
            pinnedListOrder: null,
            parentSpaceUuid: null,
            path: 'test_space',
        });
        mockSpaceModel.getSpaceBreadcrumbs.mockResolvedValue([]);
        mockSpaceModel.getSpaceQueries.mockResolvedValue([]);
        mockSpaceModel.getSpaceDashboards.mockResolvedValue([]);
        mockSpaceModel.find.mockResolvedValue([]);
        mockSpacePermissionService.getAllSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: true,
            access: [],
        });
        mockSpacePermissionService.getGroupAccess.mockResolvedValue([]);
        mockSpacePermissionService.getUserMetadataByUuids.mockResolvedValue({});
    });

    test('copies permissions when transitioning inheritParentPermissions true → false with flag enabled', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: true,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);
        mockSpacePermissionService.getInheritedPermissionsToCopy.mockResolvedValue(
            {
                userAccessEntries: [
                    {
                        userUuid: 'inherited-user',
                        role: SpaceMemberRole.EDITOR,
                    },
                ],
                groupAccessEntries: [
                    { groupUuid: 'group-1', role: SpaceMemberRole.VIEWER },
                ],
            },
        );

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            {
                name: 'Test Space',
                inheritParentPermissions: false,
            },
        );

        expect(
            mockSpacePermissionService.getInheritedPermissionsToCopy,
        ).toHaveBeenCalledWith('space-uuid');
        expect(mockSpaceModel.updateWithCopiedPermissions).toHaveBeenCalledWith(
            'space-uuid',
            expect.objectContaining({ inheritParentPermissions: false }),
            [{ userUuid: 'inherited-user', role: SpaceMemberRole.EDITOR }],
            [{ groupUuid: 'group-1', role: SpaceMemberRole.VIEWER }],
        );
        expect(mockSpaceModel.update).not.toHaveBeenCalled();
    });

    test('does NOT copy permissions when transitioning false → true', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: false,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            {
                name: 'Test Space',
                inheritParentPermissions: true,
            },
        );

        expect(
            mockSpacePermissionService.getInheritedPermissionsToCopy,
        ).not.toHaveBeenCalled();
        expect(
            mockSpaceModel.updateWithCopiedPermissions,
        ).not.toHaveBeenCalled();
        expect(mockSpaceModel.update).toHaveBeenCalled();
    });

    test('does NOT copy when inheritParentPermissions is unchanged (still true)', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: true,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            {
                name: 'Renamed Space',
            },
        );

        expect(
            mockSpacePermissionService.getInheritedPermissionsToCopy,
        ).not.toHaveBeenCalled();
        expect(
            mockSpaceModel.updateWithCopiedPermissions,
        ).not.toHaveBeenCalled();
        expect(mockSpaceModel.update).toHaveBeenCalled();
    });

    test('auto-adds acting user to copied permissions when making space private', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: true,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);

        // User has EDITOR access inherited from project (no direct access)
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: true,
            access: [
                {
                    userUuid: mockUser.userUuid,
                    role: SpaceMemberRole.EDITOR,
                    hasDirectAccess: false,
                    inheritedFrom: 'project',
                },
            ],
        });
        mockSpacePermissionService.getInheritedPermissionsToCopy.mockResolvedValue(
            { userAccessEntries: [], groupAccessEntries: [] },
        );

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            { name: 'Test Space', inheritParentPermissions: false },
        );

        // Acting user should be added to the copied permissions entries
        expect(mockSpaceModel.updateWithCopiedPermissions).toHaveBeenCalledWith(
            'space-uuid',
            expect.anything(),
            expect.arrayContaining([
                {
                    userUuid: mockUser.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            ]),
            [],
        );
    });

    test('deduplicates acting user when already present in inherited entries from ancestors', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: true,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);

        // User has EDITOR access inherited (not direct) on the target space
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: true,
            access: [
                {
                    userUuid: mockUser.userUuid,
                    role: SpaceMemberRole.EDITOR,
                    hasDirectAccess: false,
                    inheritedFrom: 'space',
                },
            ],
        });

        // Same user already appears in inherited entries from an ancestor with VIEWER role
        mockSpacePermissionService.getInheritedPermissionsToCopy.mockResolvedValue(
            {
                userAccessEntries: [
                    {
                        userUuid: mockUser.userUuid,
                        role: SpaceMemberRole.VIEWER,
                    },
                ],
                groupAccessEntries: [],
            },
        );

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            { name: 'Test Space', inheritParentPermissions: false },
        );

        // Should deduplicate and keep the highest role (EDITOR > VIEWER), not create a duplicate
        expect(mockSpaceModel.updateWithCopiedPermissions).toHaveBeenCalledWith(
            'space-uuid',
            expect.anything(),
            [
                {
                    userUuid: mockUser.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            ],
            [],
        );
    });

    test('does NOT add acting user to copied permissions if they already have direct access', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: true,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);

        // User already has direct access
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: true,
            access: [
                {
                    userUuid: mockUser.userUuid,
                    role: SpaceMemberRole.EDITOR,
                    hasDirectAccess: true,
                    inheritedFrom: undefined,
                },
            ],
        });
        mockSpacePermissionService.getInheritedPermissionsToCopy.mockResolvedValue(
            { userAccessEntries: [], groupAccessEntries: [] },
        );

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            { name: 'Test Space', inheritParentPermissions: false },
        );

        // User should NOT appear in copied permissions (already has direct access)
        expect(mockSpaceModel.updateWithCopiedPermissions).toHaveBeenCalledWith(
            'space-uuid',
            expect.anything(),
            [],
            [],
        );
    });

    test('does NOT copy permissions when making space public', async () => {
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: false,
        });
        mockSpaceModel.isRootSpace.mockResolvedValue(true);

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            { name: 'Test Space', inheritParentPermissions: true },
        );

        // turnInheritOff is false (going public), so no copy or auto-add
        expect(
            mockSpacePermissionService.getSpaceAccessContext,
        ).not.toHaveBeenCalled();
        expect(
            mockSpaceModel.updateWithCopiedPermissions,
        ).not.toHaveBeenCalled();
    });
});
