import { DashboardTileTypes } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { PromoteService } from './PromoteService';
import {
    dashboardChartWithinDashboardTile,
    existingUpstreamChart,
    existingUpstreamDashboard,
    missingUpstreamChart,
    missingUpstreamDashboard,
    promotedChart,
    promotedChartWithinDashboard,
    promotedDashboard,
    promotedDashboardWithChartWithinDashboard,
    user,
} from './PromoteService.mock';

const projectModel = {};

const savedChartModel = {
    get: jest.fn(async () => promotedChart.chart),
    find: jest.fn(async () => [existingUpstreamChart.chart]),
    create: jest.fn(async () => existingUpstreamChart.chart),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => promotedChart.space),
    find: jest.fn(async () => [existingUpstreamChart.space]),
    getUserSpaceAccess: jest.fn(async () => []),
    createSpace: jest.fn(async () => existingUpstreamChart.space),
};
const dashboardModel = {
    create: jest.fn(async () => existingUpstreamDashboard.dashboard),
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

    test('getChartChanges chart with no changes', async () => {
        const changes = PromoteService.getChartChanges(
            promotedChart,
            existingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('no changes');
        expect(changes.spaces[0].action).toBe('no changes');
    });

    test('getChartChanges update chart', async () => {
        const updatedAt = new Date();
        const changes = PromoteService.getChartChanges(
            {
                ...promotedChart,
                chart: {
                    ...promotedChart.chart,
                    updatedAt,
                },
            },
            existingUpstreamChart,
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('no changes');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            uuid: existingUpstreamChart.chart?.uuid,
            spaceUuid: existingUpstreamChart.space?.uuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: missingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
            updatedAt,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart and create space', async () => {
        const updatedAt = new Date();

        const changes = PromoteService.getChartChanges(
            {
                ...promotedChart,
                chart: {
                    ...promotedChart.chart,
                    updatedAt,
                },
            },
            {
                ...existingUpstreamChart,
                chart: {
                    ...existingUpstreamChart.chart!,
                    spaceUuid: promotedChart.chart.spaceUuid,
                },
                space: undefined,
            },
        );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(0);

        expect(changes.charts[0].action).toBe('update');
        expect(changes.spaces[0].action).toBe('create');

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            uuid: existingUpstreamChart.chart?.uuid,
            oldUuid: promotedChart.chart.uuid,
            projectUuid: existingUpstreamChart.projectUuid,
            spaceSlug: promotedChart.space.slug,
            updatedAt,
            spaceUuid: promotedChart.chart.spaceUuid, // This is a placeholder, will be updated after creating new space
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

    test('getPromotionDashboardChanges create empty dashboard and space', async () => {
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
    test('getPromotionDashboardChanges create dashboard with chart tiles and space', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChart.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

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
        expect(changes.charts[0].action).toBe('create');

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

        expect(changes.charts[0].data).toEqual({
            ...promotedChart.chart,
            oldUuid: promotedChart.chart.uuid,
            spaceSlug: promotedChart.space.slug,
            spaceUuid: promotedChart.space.uuid,
            projectUuid: missingUpstreamDashboard.projectUuid,
            dashboardUuid: null, // not within dashboard
            dashboardName: null,
        });
    });

    test('getPromotionDashboardChanges create dashboard with chart tiles in different spaces', async () => {
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
        expect(changes.charts[0].action).toBe('no changes');

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

    test('getPromotionDashboardChanges update dashboard with chart tiles ', async () => {
        const updatedAt = new Date();
        const updatedPromotedChart = { ...promotedChart.chart, updatedAt };
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => updatedPromotedChart,
        );

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

        expect(changes.charts[0].data).toEqual({
            ...updatedPromotedChart,
            projectUuid: existingUpstreamDashboard.projectUuid,
            uuid: existingUpstreamChart.chart?.uuid,
            oldUuid: promotedChart.chart.uuid,
            spaceSlug: promotedChart.space.slug,
            spaceUuid: existingUpstreamDashboard.space?.uuid,
        });
    });

    test('getPromotionDashboardChanges create dashboard with new chart within dashboard and space', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChartWithinDashboard.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1); // Chart and dashboard are in the same space
        expect(changes.dashboards.length).toBe(1);

        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('create');
        expect(changes.charts[0].action).toBe('create');

        expect(changes.dashboards[0].data).toEqual({
            ...promotedDashboardWithChartWithinDashboard.dashboard,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
        });

        expect(promotedCharts.length).toBe(1);

        expect(changes.spaces[0].data).toEqual({
            ...promotedDashboard.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
        });

        expect(changes.charts[0].data).toEqual({
            ...promotedChartWithinDashboard.chart,
            oldUuid: promotedChartWithinDashboard.chart.uuid,
            spaceSlug: promotedChartWithinDashboard.space.slug,
            spaceUuid: promotedChartWithinDashboard.space.uuid,
            projectUuid: missingUpstreamDashboard.projectUuid,
            dashboardUuid:
                promotedDashboardWithChartWithinDashboard.dashboard.uuid,
            dashboardName:
                promotedDashboardWithChartWithinDashboard.dashboard.name,
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
        dashboardModel: dashboardModel as unknown as DashboardModel,
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

        const newChanges = await service.upsertSpaces(user, changes);

        expect(changes).toEqual(newChanges);
    });

    test('create space and update space uuid if a new space is created', async () => {
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

        const newChanges = await service.upsertSpaces(user, changes);

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

    test('return same changes if no new dashboard is created', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                existingUpstreamDashboard,
            );
        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.dashboards[0].action).toBe('update');

        const newChanges = await service.getOrCreateDashboard(user, changes);

        expect(changes).toEqual(newChanges);
    });

    test('create dashboard and update dashboard uuid if a new dashboard is created', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.dashboards[0].action).toBe('create');

        // Right now the dashboard is pointing to wrong dashboard uuid, this will be updated after creating new dsahboard
        expect(changes.dashboards[0].data.uuid).toEqual(
            promotedDashboard.dashboard.uuid,
        );
        // Chart is not within dashboard
        expect(changes.charts[0].data.dashboardUuid).toEqual(null);
        const newChanges = await service.getOrCreateDashboard(user, changes);

        expect(dashboardModel.create).toHaveBeenCalledTimes(1);

        expect(newChanges.dashboards[0].data.uuid).toEqual(
            existingUpstreamDashboard.dashboard?.uuid,
        );
        expect(newChanges.charts[0].data.dashboardUuid).toEqual(null);
    });

    test('create dashboard and update dashboard uuid if a new dashboard with chart within dashboard is created', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChartWithinDashboard.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.dashboards[0].action).toBe('create');

        // Right now the chart within dashboard is pointing to wrong dashboard uuid, this will be updated after creating new dsahboard
        expect(changes.charts[0].data.dashboardUuid).toEqual(
            promotedDashboardWithChartWithinDashboard.dashboard.uuid,
        );
        const newChanges = await service.getOrCreateDashboard(user, changes);

        expect(newChanges.charts[0].data.dashboardUuid).toEqual(
            existingUpstreamDashboard.dashboard?.uuid,
        );
    });

    test('create charts returns no changes if no chart is created', async () => {
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.charts[0].action).toBe('no changes');

        expect(changes.charts[0].data.uuid).toEqual(
            existingUpstreamChart.chart?.uuid,
        );
        const newChanges = await service.upsertCharts(user, changes);

        expect(dashboardModel.create).toHaveBeenCalledTimes(0);

        expect(newChanges.charts[0].data.uuid).toEqual(
            existingUpstreamChart.chart?.uuid,
        );
    });

    test('create charts and update dashboard tile uuids if a new chart created', async () => {
        (savedChartModel.get as jest.Mock).mockImplementationOnce(
            async () => promotedChartWithinDashboard.chart,
        );
        (savedChartModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        const createdChart = {
            ...promotedChartWithinDashboard.chart,
            uuid: 'new-chart-uuid',
        };

        (savedChartModel.create as jest.Mock).mockImplementationOnce(
            async () => createdChart,
        );
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.dashboards[0].action).toBe('create');

        expect(changes.charts[0].data.uuid).toEqual(
            promotedChartWithinDashboard.chart?.uuid,
        );
        const tile = changes.dashboards[0].data.tiles[0];
        expect(
            tile.type === DashboardTileTypes.SAVED_CHART &&
                tile.properties.savedChartUuid,
        ).toEqual(promotedChartWithinDashboard.chart?.uuid);
        const newChanges = await service.upsertCharts(user, changes);

        expect(savedChartModel.create).toHaveBeenCalledTimes(1);

        expect(newChanges.charts[0].data.uuid).toEqual(createdChart.uuid);

        const newTile = newChanges.dashboards[0].data.tiles[0];
        expect(
            newTile.type === DashboardTileTypes.SAVED_CHART &&
                newTile.properties.savedChartUuid,
        ).toEqual(createdChart.uuid);
    });
});
