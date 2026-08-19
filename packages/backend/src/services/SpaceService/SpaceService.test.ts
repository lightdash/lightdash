import {
    AbilityAction,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    SpaceMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import {
    SpacePermissionService,
    type SpaceAccessContextForCasl,
} from './SpacePermissionService';
import { SpaceService } from './SpaceService';
import {
    createSpaceAccessContext,
    createTestSpace,
    createTestUser,
} from './SpaceService.mock';

describe('SpaceService', () => {
    let service: SpaceService;
    const mockGetSpaceAccessContext = vi.fn();

    beforeEach(() => {
        mockGetSpaceAccessContext.mockReset();

        service = new SpaceService({
            analytics: analyticsMock,
            lightdashConfig: lightdashConfigMock,
            projectModel: {} as ProjectModel,
            spaceModel: {} as SpaceModel,
            organizationModel: {} as OrganizationModel,
            organizationMemberProfileModel:
                {} as OrganizationMemberProfileModel,
            pinnedListModel: {} as PinnedListModel,
            spacePermissionService: {
                getSpaceAccessContext: mockGetSpaceAccessContext,
            } as unknown as SpacePermissionService,
            savedChartService: {} as SavedChartService,
            dashboardService: {} as DashboardService,
            appGenerateService: undefined,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('moveToSpace', () => {
        it('loads the source space scoped to the requested project', async () => {
            const spaceModel = {
                getSpaceSummary: vi.fn(async () => ({
                    uuid: 'spaceUuid',
                    name: 'Space',
                    projectUuid: 'projectUuid',
                    parentSpaceUuid: 'parentSpaceUuid',
                })),
                moveToSpace: vi.fn(async () => undefined),
            };
            const spacePermissionService = {
                can: vi.fn(async () => true),
            };
            const moveService = new SpaceService({
                analytics: analyticsMock,
                lightdashConfig: lightdashConfigMock,
                projectModel: {} as ProjectModel,
                spaceModel: spaceModel as unknown as SpaceModel,
                organizationModel: {} as OrganizationModel,
                organizationMemberProfileModel:
                    {} as OrganizationMemberProfileModel,
                pinnedListModel: {} as PinnedListModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
                savedChartService: {} as SavedChartService,
                dashboardService: {} as DashboardService,
                appGenerateService: undefined,
            });

            await moveService.moveToSpace(
                createTestUser() as SessionUser,
                {
                    projectUuid: 'projectUuid',
                    itemUuid: 'spaceUuid',
                    targetSpaceUuid: null,
                },
                { trackEvent: false },
            );

            expect(spaceModel.getSpaceSummary).toHaveBeenCalledWith(
                'spaceUuid',
                { projectUuid: 'projectUuid' },
            );
            expect(spaceModel.moveToSpace).toHaveBeenCalledWith(
                {
                    projectUuid: 'projectUuid',
                    itemUuid: 'spaceUuid',
                    targetSpaceUuid: null,
                },
                { tx: undefined },
            );
        });
    });

    describe('_userCanActionSpace', () => {
        describe('organization admins', () => {
            it.each([
                {
                    name: 'can view private space in their org',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: { inheritsFromOrgOrProject: false },
                    access: {},
                    expectedResult: true,
                },
                {
                    name: 'cannot view private space in different org',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: {
                        organizationUuid: 'different-org',
                        inheritsFromOrgOrProject: false,
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
                    space: { inheritsFromOrgOrProject: false },
                    access: {},
                    expectedResult: true,
                },
                {
                    name: 'cannot view private space in different project',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: {
                        projectUuid: 'different-project',
                        inheritsFromOrgOrProject: false,
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
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view private space if user group granted access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view public space in their project',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot view private space without access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: {},
                    action: 'view',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update public spaces',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with view access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group view access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update dashboard in private space with update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },
                {
                    name: 'cannot update dashboard in private space with group update access',
                    user: { projectRole: ProjectMemberRole.VIEWER },
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view private space if user group granted access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can view public space in their project',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot view private space without access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: {},
                    action: 'view',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update public spaces',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with view access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group view access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private spaces with group update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'can update dashboard in private space with update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'can update dashboard in private space with group update access',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.EDITOR },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'can update dashboard when user has editor role but group has viewer role (user has priority)',
                    user: { projectRole: ProjectMemberRole.INTERACTIVE_VIEWER },
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: false },
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
                        inheritsFromOrgOrProject: false,
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
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot view private space without explicit access',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: {},
                    action: 'view',
                    expectedResult: false,
                    contentType: 'Space',
                },
                // Basic update access
                {
                    name: 'can update public space by default',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'cannot update private space without access',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: {},
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                // Downgrade cases - direct space role
                {
                    name: 'can only view space when explicitly given viewer role (downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'can still view space when downgraded to viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                // Downgrade cases - group space role
                {
                    name: 'can only view private space when group has viewer role (downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Space',
                },
                {
                    name: 'can still view private space when group downgrades to viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'view',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'can still update public space when group has viewer role (no downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: true },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Space',
                },
                // Mixed role cases (group takes priority)
                {
                    name: 'group viewer role overrides direct editor role (downgrade)',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: true },
                    access: {},
                    action: 'update',
                    expectedResult: true,
                    contentType: 'Dashboard',
                },
                {
                    name: 'cannot update dashboard when space role is viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'update',
                    expectedResult: false,
                    contentType: 'Dashboard',
                },
                {
                    name: 'cannot update dashboard when group space role is viewer',
                    user: { projectRole: ProjectMemberRole.EDITOR },
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: true },
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
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'org admin can manage space even with viewer group role',
                    user: { organizationRole: OrganizationMemberRole.ADMIN },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project admin can manage space even with viewer space role',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { inheritsFromOrgOrProject: false },
                    access: { spaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project admin can manage space even with viewer group role',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { inheritsFromOrgOrProject: false },
                    access: { groupSpaceRole: SpaceMemberRole.VIEWER },
                    action: 'manage',
                    expectedResult: true,
                    contentType: 'Space',
                },
                {
                    name: 'project admin can manage space even with multiple group roles',
                    user: { projectRole: ProjectMemberRole.ADMIN },
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: false },
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
                    space: { inheritsFromOrgOrProject: false },
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
    // oxlint-disable-next-line vitest-js/no-commented-out-tests -- kept as documentation of the untested group-role cases above
    // it.each([
    //     {
    //         name: 'user with multiple project group roles gets highest role (admin over viewer)',
    //         user: {
    //             projectRole: ProjectMemberRole.VIEWER,
    //             projectGroupRoles: [ProjectMemberRole.VIEWER, ProjectMemberRole.ADMIN]
    //         },
    //         space: { inheritsFromOrgOrProject: false },
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
    //         space: { inheritsFromOrgOrProject: false },
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
    //         space: { inheritsFromOrgOrProject: false },
    //         access: { spaceRole: SpaceMemberRole.EDITOR },
    //         action: 'update',
    //         expectedResult: true,
    //         contentType: 'Dashboard',
    //     },
});

describe('SpaceService.updateSpace - permission copy on inherit toggle', () => {
    const mockSpaceModel = {
        getSpaceSummary: vi.fn(),
        isRootSpace: vi.fn(),
        update: vi.fn(),
        updateWithCopiedPermissions: vi.fn(),
        addSpaceAccess: vi.fn(),
        get: vi.fn(),
        getSpaceBreadcrumbs: vi.fn(),
        getSpaceQueries: vi.fn(),
        getSpaceDashboards: vi.fn(),
        find: vi.fn(),
    };
    const mockSpacePermissionService = {
        can: vi.fn(),
        getAccessibleSpaceUuids: vi.fn(),
        getSpaceAccessContext: vi.fn(),
        getAllSpaceAccessContext: vi.fn(),
        mergeAdminAccess: vi.fn(),
        getPaginatedSpaceAccess: vi.fn(),
        getRawDirectAccess: vi.fn(),
        getGroupAccess: vi.fn(),
        getUserMetadataByUuids: vi.fn(),
        getInheritedPermissionsToCopy: vi.fn(),
    };
    const mockUser = createTestUser({
        organizationRole: OrganizationMemberRole.ADMIN,
    });

    let service: SpaceService;

    beforeEach(() => {
        vi.resetAllMocks();

        service = new SpaceService({
            analytics: analyticsMock,
            lightdashConfig: lightdashConfigMock,
            projectModel: {} as ProjectModel,
            spaceModel: mockSpaceModel as unknown as SpaceModel,
            organizationModel: {} as OrganizationModel,
            organizationMemberProfileModel:
                {} as OrganizationMemberProfileModel,
            pinnedListModel: {} as PinnedListModel,
            spacePermissionService:
                mockSpacePermissionService as unknown as SpacePermissionService,
            savedChartService: {} as SavedChartService,
            dashboardService: {} as DashboardService,
            appGenerateService: undefined,
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
            admins: [],
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
            admins: [],
        });
        mockSpacePermissionService.mergeAdminAccess.mockImplementation(
            (ctx: SpaceAccessContextForCasl) => ctx.access,
        );
        mockSpacePermissionService.getGroupAccess.mockResolvedValue([]);
        mockSpacePermissionService.getUserMetadataByUuids.mockResolvedValue({});
        mockSpacePermissionService.getRawDirectAccess.mockResolvedValue({
            'space-uuid': { users: [], groups: [] },
        });
    });

    test('getSpace returns not found when the space is missing', async () => {
        mockSpaceModel.get.mockRejectedValueOnce(
            new NotFoundError('Space not found'),
        );

        await expect(
            service.getSpace(
                'project-uuid',
                mockUser as unknown as SessionUser,
                'deleted-space-uuid',
            ),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockSpaceModel.get).toHaveBeenCalledOnce();
        expect(mockSpacePermissionService.can).not.toHaveBeenCalled();
    });

    test('getSpaceAccessList rejects a space from another project', async () => {
        await expect(
            service.getSpaceAccessList(
                'other-project-uuid',
                mockUser as unknown as SessionUser,
                'space-uuid',
                {},
            ),
        ).rejects.toBeInstanceOf(NotFoundError);

        expect(mockSpacePermissionService.can).not.toHaveBeenCalled();
        expect(
            mockSpacePermissionService.getPaginatedSpaceAccess,
        ).not.toHaveBeenCalled();
    });

    test('getSpaceAccessList requires view access', async () => {
        mockSpacePermissionService.can.mockResolvedValue(false);

        await expect(
            service.getSpaceAccessList(
                'project-uuid',
                mockUser as unknown as SessionUser,
                'space-uuid',
                {},
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect(
            mockSpacePermissionService.getPaginatedSpaceAccess,
        ).not.toHaveBeenCalled();
    });

    test('getSpaceAccessList delegates pagination and filters with the requesting user', async () => {
        mockSpacePermissionService.getPaginatedSpaceAccess.mockResolvedValue({
            data: [],
            pagination: {
                page: 1,
                pageSize: 20,
                totalPageCount: 0,
                totalResults: 0,
            },
        });

        await expect(
            service.getSpaceAccessList(
                'project-uuid',
                mockUser as unknown as SessionUser,
                'space-uuid',
                {
                    paginateArgs: { page: 1, pageSize: 20 },
                    filters: { searchQuery: 'viewer', directOnly: true },
                },
            ),
        ).resolves.toEqual({
            data: [],
            pagination: {
                page: 1,
                pageSize: 20,
                totalPageCount: 0,
                totalResults: 0,
            },
        });

        expect(
            mockSpacePermissionService.getPaginatedSpaceAccess,
        ).toHaveBeenCalledWith('space-uuid', {
            paginateArgs: { page: 1, pageSize: 20 },
            filters: { searchQuery: 'viewer', directOnly: true },
            currentUserUuid: mockUser.userUuid,
        });
    });

    test('getSpaceAccessList rejects more than 100 user uuids', async () => {
        await expect(
            service.getSpaceAccessList(
                'project-uuid',
                mockUser as unknown as SessionUser,
                'space-uuid',
                {
                    filters: {
                        userUuids: Array.from(
                            { length: 101 },
                            (_, index) => `user-${index}`,
                        ),
                    },
                },
            ),
        ).rejects.toEqual(
            new ParameterError('userUuids accepts at most 100 values'),
        );

        expect(
            mockSpacePermissionService.getPaginatedSpaceAccess,
        ).not.toHaveBeenCalled();
    });

    test('getSpaceAccessList returns empty pagination for an empty user uuid filter', async () => {
        await expect(
            service.getSpaceAccessList(
                'project-uuid',
                mockUser as unknown as SessionUser,
                'space-uuid',
                {
                    paginateArgs: { page: 3, pageSize: 20 },
                    filters: { userUuids: [] },
                },
            ),
        ).resolves.toEqual({
            data: [],
            pagination: {
                page: 3,
                pageSize: 20,
                totalPageCount: 0,
                totalResults: 0,
            },
        });

        expect(
            mockSpacePermissionService.getPaginatedSpaceAccess,
        ).not.toHaveBeenCalled();
    });

    test('updateSpace tracks distinct persisted direct user shares', async () => {
        const trackSpy = vi.spyOn(analyticsMock, 'track');
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'space-uuid',
            name: 'Test Space',
            projectUuid: 'project-uuid',
            organizationUuid: 'org-uuid',
            inheritParentPermissions: true,
            parentSpaceUuid: null,
        });
        mockSpacePermissionService.getRawDirectAccess.mockResolvedValue({
            'space-uuid': {
                users: [
                    {
                        userUuid: 'direct-user-1',
                        email: 'one@example.com',
                        isInternal: false,
                        role: SpaceMemberRole.VIEWER,
                    },
                    {
                        userUuid: 'direct-user-2',
                        email: 'two@example.com',
                        isInternal: false,
                        role: SpaceMemberRole.EDITOR,
                    },
                    {
                        userUuid: 'direct-user-2',
                        email: 'two@example.com',
                        isInternal: false,
                        role: SpaceMemberRole.EDITOR,
                    },
                ],
                groups: [],
            },
        });

        await service.updateSpace(
            mockUser as unknown as SessionUser,
            'space-uuid',
            { name: 'Renamed Space' },
        );

        expect(
            mockSpacePermissionService.getRawDirectAccess,
        ).toHaveBeenCalledWith(['space-uuid']);
        expect(trackSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'space.updated',
                properties: expect.objectContaining({ userAccessCount: 2 }),
            }),
        );
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
        ).toHaveBeenCalledOnce();
        expect(
            mockSpaceModel.updateWithCopiedPermissions,
        ).not.toHaveBeenCalled();
    });

    test('getSpace returns only the requesting org admin when the resolver omits them', async () => {
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: false,
            access: [],
            admins: [{ userUuid: mockUser.userUuid, source: 'organization' }],
        });
        mockSpacePermissionService.mergeAdminAccess.mockReturnValue([
            {
                userUuid: mockUser.userUuid,
                role: SpaceMemberRole.ADMIN,
                hasDirectAccess: false,
                projectRole: ProjectMemberRole.ADMIN,
                inheritedRole: OrganizationMemberRole.ADMIN,
                inheritedFrom: 'organization',
            },
        ]);
        mockSpacePermissionService.getUserMetadataByUuids.mockResolvedValue({
            [mockUser.userUuid]: {
                firstName: 'Org',
                lastName: 'Admin',
                email: 'orgadmin@example.com',
            },
        });

        const result = await service.getSpace(
            'project-uuid',
            mockUser as unknown as SessionUser,
            'space-uuid',
        );

        expect(
            mockSpacePermissionService.getSpaceAccessContext,
        ).toHaveBeenCalledWith(mockUser.userUuid, 'space-uuid');
        expect(
            mockSpacePermissionService.getAllSpaceAccessContext,
        ).not.toHaveBeenCalled();
        expect(result.access).toEqual([
            expect.objectContaining({
                userUuid: mockUser.userUuid,
                role: SpaceMemberRole.ADMIN,
                hasDirectAccess: false,
                inheritedFrom: 'organization',
                firstName: 'Org',
                email: 'orgadmin@example.com',
            }),
        ]);
    });

    test('getSpace keeps the requesting admin direct role', async () => {
        const directAccess = {
            userUuid: mockUser.userUuid,
            role: SpaceMemberRole.EDITOR,
            hasDirectAccess: true,
            projectRole: undefined,
            inheritedRole: undefined,
            inheritedFrom: undefined,
        };
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: false,
            access: [directAccess],
            admins: [{ userUuid: mockUser.userUuid, source: 'organization' }],
        });
        mockSpacePermissionService.mergeAdminAccess.mockReturnValue([
            directAccess,
        ]);
        mockSpacePermissionService.getUserMetadataByUuids.mockResolvedValue({
            [mockUser.userUuid]: {
                firstName: 'Org',
                lastName: 'Admin',
                email: 'orgadmin@example.com',
            },
        });

        const result = await service.getSpace(
            'project-uuid',
            mockUser as unknown as SessionUser,
            'space-uuid',
        );

        expect(result.access).toHaveLength(1);
        expect(result.access[0]).toEqual(
            expect.objectContaining({
                userUuid: mockUser.userUuid,
                role: SpaceMemberRole.EDITOR,
                hasDirectAccess: true,
            }),
        );
    });

    test('getSpace does not duplicate the requesting admin already resolved', async () => {
        const adminAccess = {
            userUuid: mockUser.userUuid,
            role: SpaceMemberRole.ADMIN,
            hasDirectAccess: false,
            projectRole: ProjectMemberRole.ADMIN,
            inheritedRole: OrganizationMemberRole.ADMIN,
            inheritedFrom: 'organization' as const,
        };
        mockSpacePermissionService.getSpaceAccessContext.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            inheritsFromOrgOrProject: true,
            access: [adminAccess],
            admins: [{ userUuid: mockUser.userUuid, source: 'organization' }],
        });
        mockSpacePermissionService.mergeAdminAccess.mockReturnValue([
            adminAccess,
        ]);
        mockSpacePermissionService.getUserMetadataByUuids.mockResolvedValue({
            [mockUser.userUuid]: {
                firstName: 'Org',
                lastName: 'Admin',
                email: 'orgadmin@example.com',
            },
        });

        const result = await service.getSpace(
            'project-uuid',
            mockUser as unknown as SessionUser,
            'space-uuid',
        );

        expect(result.access).toHaveLength(1);
        expect(result.access[0]).toEqual(
            expect.objectContaining({
                userUuid: mockUser.userUuid,
                role: SpaceMemberRole.ADMIN,
            }),
        );
    });
});

describe('SpaceService - space share target validation', () => {
    const mockUser = createTestUser({
        organizationRole: OrganizationMemberRole.ADMIN,
    });

    const mockSpaceModel = {
        getSpaceSummary: vi.fn(),
        addSpaceAccess: vi.fn(),
        createSpace: vi.fn(),
    };
    const mockOrganizationMemberProfileModel = {
        findOrganizationMemberUuids: vi.fn(),
    };
    const mockSpacePermissionService = {
        can: vi.fn(),
    };
    const mockProjectModel = {
        getSummary: vi.fn(),
    };

    let service: SpaceService;

    beforeEach(() => {
        vi.resetAllMocks();

        service = new SpaceService({
            analytics: analyticsMock,
            lightdashConfig: lightdashConfigMock,
            projectModel: mockProjectModel as unknown as ProjectModel,
            spaceModel: mockSpaceModel as unknown as SpaceModel,
            organizationModel: {} as OrganizationModel,
            organizationMemberProfileModel:
                mockOrganizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
            pinnedListModel: {} as PinnedListModel,
            spacePermissionService:
                mockSpacePermissionService as unknown as SpacePermissionService,
            savedChartService: {} as SavedChartService,
            dashboardService: {} as DashboardService,
            appGenerateService: undefined,
        });

        mockSpacePermissionService.can.mockResolvedValue(true);
        mockSpaceModel.getSpaceSummary.mockResolvedValue({
            uuid: 'test-space-uuid',
            organizationUuid: 'test-org-uuid',
            projectUuid: 'test-project-uuid',
        });
    });

    describe('addSpaceUserAccess', () => {
        it('adds access when the target user is a member of the organization', async () => {
            mockOrganizationMemberProfileModel.findOrganizationMemberUuids.mockResolvedValue(
                ['target-user-uuid'],
            );

            await service.addSpaceUserAccess(
                mockUser as unknown as SessionUser,
                'test-space-uuid',
                'target-user-uuid',
                SpaceMemberRole.VIEWER,
            );

            expect(mockSpaceModel.addSpaceAccess).toHaveBeenCalledWith(
                'test-space-uuid',
                'target-user-uuid',
                SpaceMemberRole.VIEWER,
            );
        });

        it('rejects a target user outside the organization without writing access', async () => {
            mockOrganizationMemberProfileModel.findOrganizationMemberUuids.mockResolvedValue(
                [],
            );

            await expect(
                service.addSpaceUserAccess(
                    mockUser as unknown as SessionUser,
                    'test-space-uuid',
                    'other-org-user-uuid',
                    SpaceMemberRole.VIEWER,
                ),
            ).rejects.toThrowError(NotFoundError);

            expect(mockSpaceModel.addSpaceAccess).not.toHaveBeenCalled();
        });
    });

    describe('createSpace', () => {
        it('rejects initial access entries for users outside the organization without creating the space', async () => {
            mockProjectModel.getSummary.mockResolvedValue({
                organizationUuid: 'test-org-uuid',
            });
            mockOrganizationMemberProfileModel.findOrganizationMemberUuids.mockResolvedValue(
                ['member-user-uuid'],
            );

            await expect(
                service.createSpace(
                    'test-project-uuid',
                    mockUser as unknown as SessionUser,
                    {
                        name: 'New space',
                        access: [
                            {
                                userUuid: 'member-user-uuid',
                                role: SpaceMemberRole.VIEWER,
                            },
                            {
                                userUuid: 'other-org-user-uuid',
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    },
                ),
            ).rejects.toThrowError(NotFoundError);

            expect(mockSpaceModel.createSpace).not.toHaveBeenCalled();
        });
    });
});
