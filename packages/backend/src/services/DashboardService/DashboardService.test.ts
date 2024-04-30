import { Ability } from '@casl/ability';
import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ProjectMemberRole,
    SessionUser,
} from '@lightdash/common';

import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { DashboardService } from './DashboardService';
import {
    chart,
    createDashboard,
    createDashboardWithSlug,
    createDashboardWithTileIds,
    dashboard,
    dashboardsDetails,
    privateSpace,
    publicSpace,
    space,
    updateDashboard,
    updateDashboardDetailsAndTiles,
    updateDashboardTiles,
    updateDashboardTilesWithIds,
    user,
} from './DashboardService.mock';

const dashboardModel = {
    getAllByProject: jest.fn(async () => dashboardsDetails),

    getById: jest.fn(async () => dashboard),

    create: jest.fn(async () => dashboard),

    update: jest.fn(async () => dashboard),

    delete: jest.fn(async () => dashboard),

    addVersion: jest.fn(async () => dashboard),

    getOrphanedCharts: jest.fn(async () => []),
};

const spaceModel = {
    getFullSpace: jest.fn(async () => publicSpace),
    getSpaceSummary: jest.fn(async () => publicSpace),
    getFirstAccessibleSpace: jest.fn(async () => space),
    getUserSpaceAccess: jest.fn(async () => []),
};
const analyticsModel = {
    addDashboardViewEvent: jest.fn(async () => null),
};
const savedChartModel = {
    get: jest.fn(async () => chart),
    delete: jest.fn(async () => ({
        uuid: 'chart_uuid',
        projectUuid: 'project_uuid',
    })),
};

jest.spyOn(analyticsMock, 'track');
describe('DashboardService', () => {
    const projectUuid = 'projectUuid';
    const { uuid: dashboardUuid } = dashboard;
    const service = new DashboardService({
        analytics: analyticsMock,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        analyticsModel: analyticsModel as unknown as AnalyticsModel,
        pinnedListModel: {} as PinnedListModel,
        schedulerModel: {} as SchedulerModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        slackClient: {} as SlackClient,
        schedulerClient: {} as SchedulerClient,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    test('should get dashboard by uuid', async () => {
        const result = await service.getById(user, dashboard.uuid);

        expect(result).toEqual(dashboard);
        expect(dashboardModel.getById).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getById).toHaveBeenCalledWith(dashboard.uuid);
    });
    test('should get all dashboard by project uuid', async () => {
        const result = await service.getAllByProject(
            user,
            projectUuid,
            undefined,
        );

        expect(result).toEqual(dashboardsDetails);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledWith(
            projectUuid,
            undefined,
        );
    });
    test('should create dashboard', async () => {
        const result = await service.create(user, projectUuid, createDashboard);

        expect(result).toEqual({ ...dashboard, isPrivate: space.is_private });
        expect(dashboardModel.create).toHaveBeenCalledTimes(1);
        expect(dashboardModel.create).toHaveBeenCalledWith(
            space.space_uuid,
            createDashboardWithSlug,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.created',
            }),
        );
    });
    test('should create dashboard with tile ids', async () => {
        const result = await service.create(
            user,
            projectUuid,
            createDashboardWithTileIds,
        );

        expect(result).toEqual({ ...dashboard, isPrivate: space.is_private });
    });
    test('should update dashboard details', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboard,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.update).toHaveBeenCalledTimes(1);
        expect(dashboardModel.update).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboard,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.updated',
            }),
        );
    });
    test('should update dashboard version', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardTiles,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTiles,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should update dashboard version with tile ids', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardTilesWithIds,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTilesWithIds,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should update dashboard details & version', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardDetailsAndTiles,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.update).toHaveBeenCalledTimes(1);
        expect(dashboardModel.update).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboard,
        );
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTiles,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(2);
        expect(analyticsMock.track).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                event: 'dashboard.updated',
            }),
        );
        expect(analyticsMock.track).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should delete orphan charts when updating dashboard version', async () => {
        (dashboardModel.getOrphanedCharts as jest.Mock).mockImplementationOnce(
            async () => [{ uuid: 'chart_uuid' }],
        );

        await service.update(user, dashboardUuid, updateDashboardTiles);

        expect(savedChartModel.delete).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledTimes(2);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.deleted',
            }),
        );
    });
    test('should delete dashboard', async () => {
        await service.delete(user, dashboardUuid);

        expect(dashboardModel.delete).toHaveBeenCalledTimes(1);
        expect(dashboardModel.delete).toHaveBeenCalledWith(dashboardUuid);
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.deleted',
            }),
        );
    });
    test('should not see dashboard from other organizations', async () => {
        const anotherUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [],
            ),
        };
        await expect(
            service.getById(anotherUser, dashboard.uuid),
        ).rejects.toThrowError(ForbiddenError);
    });
    test('should see empty list if getting all dashboard by project uuid from another organization', async () => {
        const anotherUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [],
            ),
        };
        const result = await service.getAllByProject(
            anotherUser,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledWith(
            projectUuid,
            undefined,
        );
    });

    test('should not see dashboard from private space if you are not admin', async () => {
        (spaceModel.getSpaceSummary as jest.Mock).mockImplementationOnce(
            async () => privateSpace,
        );

        const userViewer = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [
                    {
                        projectUuid,
                        role: ProjectMemberRole.VIEWER,
                        userUuid: user.userUuid,
                    },
                ],
            ),
        };
        await expect(
            service.getById(userViewer, dashboard.uuid),
        ).rejects.toThrowError(ForbiddenError);
    });
    test('should see dashboard from private space if you are admin', async () => {
        (spaceModel.getFullSpace as jest.Mock).mockImplementationOnce(
            async () => privateSpace,
        );

        const result = await service.getById(user, dashboard.uuid);

        expect(result).toEqual(dashboard);
        expect(dashboardModel.getById).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getById).toHaveBeenCalledWith(dashboard.uuid);
    });

    test('should not see dashboards from private space if you are not an admin', async () => {
        (spaceModel.getSpaceSummary as jest.Mock).mockImplementationOnce(
            async () => privateSpace,
        );

        const editorUser: SessionUser = {
            ...user,
            role: OrganizationMemberRole.EDITOR,
            ability: new Ability([
                {
                    subject: 'Dashboard',
                    action: ['view', 'update', 'delete', 'create'],
                },
            ]),
        };
        const result = await service.getAllByProject(
            editorUser,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
    });
});
