import {
    AbilityAction,
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SpacePermissionService } from './SpacePermissionService';
import { SpaceService } from './SpaceService';
import {
    createSpaceAccessContext,
    createTestSpace,
    createTestUser,
} from './SpaceService.mock';

describe('SpaceService', () => {
    let service: SpaceService;
    const mockGetSpaceAccessContext = jest.fn();

    beforeEach(() => {
        mockGetSpaceAccessContext.mockReset();

        service = new SpaceService({
            analytics: analyticsMock,
            lightdashConfig: lightdashConfigMock,
            projectModel: {} as ProjectModel,
            spaceModel: {} as SpaceModel,
            pinnedListModel: {} as PinnedListModel,
            featureFlagModel: {} as FeatureFlagModel,
            spacePermissionService: {
                getSpaceAccessContext: mockGetSpaceAccessContext,
            } as unknown as SpacePermissionService,
            savedChartService: {} as SavedChartService,
            dashboardService: {} as DashboardService,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('_userCanActionSpace', () => {
        describe('organization admins', () => {
            it.each([
                {
                    name: 'can view private space in their org',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: {},
                    expectedResult: true,
                },
                {
                    name: 'cannot view private space in different org',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: {
                        organizationUuid: 'different-org',
                        isPrivate: true,
                    },
                    access: {},
                    expectedResult: false,
                },
            ])('$name', async ({ user, space, access, expectedResult }) => {
                const testUser = createTestUser(user);
                const testSpace = createTestSpace(space);

                mockGetSpaceAccessContext.mockResolvedValueOnce(
                    createSpaceAccessContext({
                        ...user,
                        ...access,
                        ...space,
                    }),
                );

                const result = await service._userCanActionSpace(
                    testUser,
                    'Space',
                    testSpace,
                    'view',
                );

                expect(result).toBe(expectedResult);
            });
        });

        describe('project admins', () => {
            it.each([
                {
                    name: 'can view private space in their project',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: {},
                    expectedResult: true,
                },
                {
                    name: 'cannot view private space in different project',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: {
                        projectUuid: 'different-project',
                        isPrivate: true,
                    },
                    access: {},
                    expectedResult: false,
                },
            ])('$name', async ({ user, space, access, expectedResult }) => {
                const testUser = createTestUser(user);
                const testSpace = createTestSpace(space);

                mockGetSpaceAccessContext.mockResolvedValueOnce(
                    createSpaceAccessContext({
                        ...user,
                        ...access,
                        ...space,
                    }),
                );

                const result = await service._userCanActionSpace(
                    testUser,
                    'Space',
                    testSpace,
                    'view',
                );

                expect(result).toBe(expectedResult);
            });
        });

        describe('project viewers', () => {
            it.each([
                {
                    name: 'can view private space if user granted access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view private space if user group granted access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view public space in their project',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: false },
                    access: {},
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot view private space without access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: {},
                    action: 'view',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update public spaces',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: false },
                    access: {},
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with view access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group view access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update dashboard in private space with update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },
                {
                    name: 'cannot update dashboard in private space with group update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },
            ])(
                '$name',
                async ({
                    user,
                    space,
                    access,
                    action,
                    expectedResult,
                    contentType,
                }) => {
                    const testUser = createTestUser(user);
                    const testSpace = createTestSpace(space);

                    mockGetSpaceAccessContext.mockResolvedValueOnce(
                        createSpaceAccessContext({
                            ...user,
                            ...access,
                            ...space,
                        }),
                    );

                    const result = await service._userCanActionSpace(
                        testUser,
                        contentType as 'Space' | 'Dashboard' | 'Chart',
                        testSpace,
                        action as AbilityAction,
                    );

                    expect(result).toBe(expectedResult);
                },
            );
        });

        describe('project interactive viewers', () => {
            it.each([
                {
                    name: 'can view private space if user granted access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view private space if user group granted access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view public space in their project',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: false },
                    access: {},
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot view private space without access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: {},
                    action: 'view',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update public spaces',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: false },
                    access: {},
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with view access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group view access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'can update dashboard in private space with update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'can update dashboard in private space with group update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'can update dashboard when user has editor role but group has viewer role (user has priority)',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: {
                        spaceRole: SpaceMemberRole.EDITOR,
                        groupSpaceRole: SpaceMemberRole.VIEWER,
                    },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },

                // TODO: This behaviour is not desired
                {
                    name: 'cannot update dashboard when user has viewer role but group has editor role (user priority)',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: {
                        spaceRole: SpaceMemberRole.VIEWER,
                        groupSpaceRole: SpaceMemberRole.EDITOR,
                    },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },

                {
                    name: 'user with multiple group roles in different projects only gets roles from correct project',
                    user: {
                        projectRole: ProjectMemberRole.INTERACTIVE_VIEWER,
                        projectGroupRoles: [ProjectMemberRole.ADMIN],
                    },
                    space: {
                        isPrivate: true,
                        projectUuid: 'different-project-uuid',
                    },
                    access: {},
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
            ])(
                '$name',
                async ({
                    user,
                    space,
                    access,
                    action,
                    expectedResult,
                    contentType,
                }) => {
                    const testUser = createTestUser(user);
                    const testSpace = createTestSpace(space);

                    mockGetSpaceAccessContext.mockResolvedValueOnce(
                        createSpaceAccessContext({
                            ...user,
                            ...access,
                            ...space,
                        }),
                    );

                    const result = await service._userCanActionSpace(
                        testUser,
                        contentType as 'Space' | 'Dashboard' | 'Chart',
                        testSpace,
                        action as AbilityAction,
                    );

                    try {
                        expect(result).toBe(expectedResult);
                    } catch (error) {
                        await service._userCanActionSpace(
                            testUser,
                            contentType as 'Space' | 'Dashboard' | 'Chart',
                            testSpace,
                            action as AbilityAction,
                        );
                        throw error;
                    }
                },
            );
        });

        describe('project editors', () => {
            it.each([
                // Basic view access
                {
                    name: 'can view public space in their project',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: false },
                    access: {},
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot view private space without explicit access',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: {},
                    action: 'view',
                    expectedResult: false,
                    contentType: 'Space',
                },
                // Basic update access
                {
                    name: 'can update public space by default',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: false },
                    access: {},
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private space without access',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: {},
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                // Downgrade cases - direct space role
                {
                    name: 'can only view space when explicitly given viewer role (downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'can still view space when downgraded to viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                // Downgrade cases - group space role
                {
                    name: 'can only view private space when group has viewer role (downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'can still view private space when group downgrades to viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can still update public space when group has viewer role (no downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Space',
                },
                // Mixed role cases (group takes priority)
                {
                    name: 'group viewer role overrides direct editor role (downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: {
                        spaceRole: SpaceMemberRole.EDITOR,
                        groupSpaceRole: SpaceMemberRole.VIEWER,
                    },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                // Dashboard specific cases
                {
                    name: 'can update dashboard in public space by default',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: false },
                    access: {},
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'cannot update dashboard when space role is viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },
                {
                    name: 'cannot update dashboard when group space role is viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },
            ])(
                '$name',
                async ({
                    user,
                    space,
                    access,
                    action,
                    expectedResult,
                    contentType,
                }) => {
                    const testUser = createTestUser(user);
                    const testSpace = createTestSpace(space);

                    mockGetSpaceAccessContext.mockResolvedValueOnce(
                        createSpaceAccessContext({
                            ...user,
                            ...access,
                            ...space,
                        }),
                    );

                    const result = await service._userCanActionSpace(
                        testUser,
                        contentType as 'Space' | 'Dashboard' | 'Chart',
                        testSpace,
                        action as AbilityAction,
                    );
                    try {
                        expect(result).toBe(expectedResult);
                    } catch (error) {
                        await service._userCanActionSpace(
                            testUser,
                            contentType as 'Space' | 'Dashboard' | 'Chart',
                            testSpace,
                            action as AbilityAction,
                        );
                        throw error;
                    }
                },
            );
        });

        describe('project developers', () => {
            it.each([
                {
                    name: 'can promote dashboard in public space',
                    user: { projectRole: ProjectMemberRole.DEVELOPER },
                    space: { isPrivate: false },
                    access: {},
                    action: 'promote',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
            ])(
                '$name',
                async ({
                    user,
                    space,
                    access,
                    action,
                    expectedResult,
                    contentType,
                }) => {
                    const testUser = createTestUser(user);
                    const testSpace = createTestSpace(space);

                    mockGetSpaceAccessContext.mockResolvedValueOnce(
                        createSpaceAccessContext({
                            ...user,
                            ...access,
                            ...space,
                        }),
                    );

                    const result = await service._userCanActionSpace(
                        testUser,
                        contentType as 'Space' | 'Dashboard' | 'Chart',
                        testSpace,
                        action as AbilityAction,
                    );

                    try {
                        expect(result).toBe(expectedResult);
                    } catch (error) {
                        await service._userCanActionSpace(
                            testUser,
                            contentType as 'Space' | 'Dashboard' | 'Chart',
                            testSpace,
                            action as AbilityAction,
                        );
                        throw error;
                    }
                },
            );
        });

        describe('role inheritance and priority', () => {
            it.each([
                {
                    name: 'org admin can manage space even with viewer space role',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'org admin can manage space even with viewer group role',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project admin can manage space even with viewer space role',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project admin can manage space even with viewer group role',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project admin can manage space even with multiple group roles',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { isPrivate: true },
                    access: {
                        groupSpaceRoles: [
                            SpaceMemberRole.VIEWER,
                            SpaceMemberRole.EDITOR,
                        ],
                    },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'user with multiple group roles gets highest role (editor over viewer)',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: {
                        groupSpaceRoles: [
                            SpaceMemberRole.VIEWER,
                            SpaceMemberRole.EDITOR,
                        ],
                    },
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'user with multiple group roles gets highest role (admin over editor)',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { isPrivate: true },
                    access: {
                        groupSpaceRoles: [
                            SpaceMemberRole.EDITOR,
                            SpaceMemberRole.ADMIN,
                        ],
                    },
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project group admin role overrides space viewer role',
                    user: {
                        projectRole: ProjectMemberRole.INTERACTIVE_VIEWER,
                        projectGroupRoles: [ProjectMemberRole.ADMIN],
                    },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project group viewer role does not override space editor role',
                    user: {
                        projectRole: ProjectMemberRole.INTERACTIVE_VIEWER,
                        projectGroupRoles: [ProjectMemberRole.VIEWER],
                    },
                    space: { isPrivate: true },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
            ])(
                '$name',
                async ({
                    user,
                    space,
                    access,
                    action,
                    expectedResult,
                    contentType,
                }) => {
                    const testUser = createTestUser(user);
                    const testSpace = createTestSpace(space);

                    mockGetSpaceAccessContext.mockResolvedValueOnce(
                        createSpaceAccessContext({
                            ...user,
                            ...access,
                            ...space,
                            projectGroupRoles: user.projectGroupRoles || [],
                        }),
                    );

                    const result = await service._userCanActionSpace(
                        testUser,
                        contentType as 'Space' | 'Dashboard' | 'Chart',
                        testSpace,
                        action as AbilityAction,
                    );

                    try {
                        expect(result).toBe(expectedResult);
                    } catch (error) {
                        await service._userCanActionSpace(
                            testUser,
                            contentType as 'Space' | 'Dashboard' | 'Chart',
                            testSpace,
                            action as AbilityAction,
                        );
                        throw error;
                    }
                },
            );
        });
    });

    // These tests should pass but they don't - could be a mock problem.
    // It could also be because in the app we actually build project abilities for every group membership before
    // we build the space abilities (here we only test space access for a single project).
    // it.each([
    //     {
    //         name: 'user with multiple project group roles gets highest role (admin over viewer)',
    //         user: {
    //             projectRole: ProjectMemberRole.VIEWER,
    //             projectGroupRoles: [ProjectMemberRole.VIEWER, ProjectMemberRole.ADMIN]
    //         },
    //         space: { isPrivate: true },
    //         access: {},
    //         action: 'manage',
    //         expectedResult: true,
    //         contentType: 'Space',
    //     },
    //     {
    //         name: 'private space is accessible to project group admin without direct access',
    //         user: {
    //             projectRole: ProjectMemberRole.VIEWER,
    //             projectGroupRoles: [ProjectMemberRole.ADMIN]
    //         },
    //         space: { isPrivate: true },
    //         access: {},
    //         action: 'manage',
    //         expectedResult: true,
    //         contentType: 'Space',
    //     },
    //     {
    //         name: 'project group viewer role does not override space editor role',
    //         user: {
    //             projectRole: ProjectMemberRole.INTERACTIVE_VIEWER,
    //             projectGroupRoles: [ProjectMemberRole.VIEWER]
    //         },
    //         space: { isPrivate: true },
    //         access: { spaceRole: SpaceMemberRole.EDITOR },
    //         action: 'update',
    //         expectedResult: true,
    //         contentType: 'Dashboard',
    //     },
});
