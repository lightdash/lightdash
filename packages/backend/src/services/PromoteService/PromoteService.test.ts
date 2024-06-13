import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { PromoteService } from './PromoteService';
import {
    existingUpstreamChart,
    existingUpstreamDashboard,
    missingUpstreamChart,
    missingUpstreamDashboard,
    promotedChart,
    promotedDashboard,
    user,
} from './PromoteService.mock';

const projectModel = {};

const savedChartModel = {
    get: jest.fn(async () => promotedChart.chart),
    find: jest.fn(async () => [existingUpstreamChart.chart]),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => promotedChart.space),
    find: jest.fn(async () => [existingUpstreamChart.space]),
    getUserSpaceAccess: jest.fn(async () => []),
    createSpace: jest.fn(async () => existingUpstreamChart.space),
};

describe('PromoteService chart changes', () => {
    test('getChartChanges create chart and space', async () => {
        const changes = PromoteService.getChartChanges(
            promotedChart,
            missingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...promotedChart.space,
            projectUuid: missingUpstreamChart.projectUuid,
        });
    });
    test('getChartChanges create chart but no space', async () => {
        const changes = PromoteService.getChartChanges(promotedChart, {
            ...missingUpstreamChart,
            space: existingUpstreamChart.space,
        });

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            spaceUuid: existingUpstreamChart.space?.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart', async () => {
        const changes = PromoteService.getChartChanges(
            promotedChart,
            existingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            uuid: promotedChart.chart.uuid, // This is a placeholder, we will not use this uuid on chart creation
            spaceUuid: existingUpstreamChart.space?.uuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart and create space', async () => {
        const changes = PromoteService.getChartChanges(promotedChart, {
            ...existingUpstreamChart,
            space: undefined,
        });

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: existingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
        });

        expect(changes.spaces[0].data).toEqual({
            ...promotedChart.space,
            projectUuid: existingUpstreamChart.projectUuid,
        });
    });
});

describe('PromoteService dashboard changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getChartChanges create empty dashboard and space', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                {
                    ...promotedDashboard,
                    dashboard: {
                        ...promotedDashboard.dashboard,
                        tiles: [],
                    },
                },
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(0);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboard.dashboard,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            tiles: [],
        });

        expect(promotedCharts).toEqual([]);

        expect(changes.spaces[0].data).toEqual({
            ...promotedDashboard.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
        });
    });
    test('getChartChanges create dashboard with chart tiles and space', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1); // Chart and dashboard are in the same space
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');
        expect(changes.charts[0].action).toBe('update');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboard.dashboard,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
        });

        expect(promotedCharts.length).toBe(1);

        expect(changes.spaces[0].data).toEqual({
            ...promotedDashboard.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
        });
    });

    test('getChartChanges create dashboard with chart tiles in different spaces', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                {
                    ...promotedDashboard,
                    space: {
                        ...promotedDashboard.space,
                        slug: 'new-space',
                    },
                },
                missingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(2); // Chart and dashboard are in different spaces
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces.map((s) => s.action)).toStrictEqual([
            'create',
            'create',
        ]);
        expect(changes.charts[0].action).toBe('update');

        expect(promotedCharts.length).toBe(1);

        expect(changes.spaces.map((s) => s.data)).toStrictEqual([
            {
                ...promotedDashboard.space,
                slug: 'new-space',
                projectUuid: missingUpstreamDashboard.projectUuid,
            },
            {
                ...promotedChart.space,
                projectUuid: missingUpstreamDashboard.projectUuid,
            },
        ]);
    });

    test('getChartChanges update dashboard with chart tiles ', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                existingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1); // Chart and dashboard are in the same space
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.charts[0].action).toBe('update');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboard.dashboard,
            projectUuid: existingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            uuid: existingUpstreamDashboard.dashboard?.uuid,
            spaceUuid: existingUpstreamDashboard.space?.uuid,
        });
    });
});

describe('PromoteService promoting and mutating changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('return same changes if no new space is created', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                existingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.spaces[0].action).toBe('no changes');

        const newChanges = await service.createNewSpaces(user, changes);

        expect(changes).toEqual(newChanges);
    });

    test('create and update space uuid if a new space is created', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.spaces[0].action).toBe('create');

        // Right now the dashboard is pointing to wrong space uuid, this will be updated after creating new spaces
        expect(changes.dashboards[0].data.spaceUuid).toEqual(
            promotedDashboard.dashboard.spaceUuid,
        );

        const newChanges = await service.createNewSpaces(user, changes);

        expect(spaceModel.createSpace).toHaveBeenCalledTimes(1);

        expect(newChanges).toEqual({
            ...changes,
            spaces: [
                {
                    ...changes.spaces[0],
                    data: {
                        ...changes.spaces[0].data,
                        uuid: existingUpstreamDashboard.space?.uuid,
                    },
                },
            ],
            dashboards: [
                {
                    ...changes.dashboards[0],
                    data: {
                        ...changes.dashboards[0].data,
                        spaceUuid: existingUpstreamDashboard.space?.uuid,
                    },
                },
            ],
            charts: [
                {
                    ...changes.charts[0],
                    data: {
                        ...changes.charts[0].data,
                        spaceUuid: existingUpstreamDashboard.space?.uuid,
                    },
                },
            ],
        });
    });
});
