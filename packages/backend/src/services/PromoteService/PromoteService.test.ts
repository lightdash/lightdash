import { DashboardTileTypes, PromotionAction } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { PromoteService } from './PromoteService';
import {
    existingUpstreamChart,
    existingUpstreamDashboard,
    existingUpstreamSqlChart,
    missingUpstreamChart,
    missingUpstreamDashboard,
    promotedChart,
    promotedChartWithinDashboard,
    promotedDashboard,
    promotedDashboardWithChartWithinDashboard,
    promotedDashboardWithNewPrivateSpace,
    promotedDashboardWithSqlTile,
    promotedSqlChart,
    upstreamFullSpace,
    upstreamSpace,
    user,
} from './PromoteService.mock';

const projectModel = {
    getSummary: jest.fn(async () => ({
        upstreamProjectUuid: existingUpstreamDashboard.projectUuid,
    })),
};

const savedChartModel = {
    get: jest.fn(async () => promotedChart.chart),
    find: jest.fn(async () => [existingUpstreamChart.chart]),
    create: jest.fn(async () => existingUpstreamChart.chart),
};

const savedSqlModel = {
    getByUuid: jest.fn(async () => promotedSqlChart),
    find: jest.fn(async () => []),
    create: jest.fn(async () => ({
        savedSqlUuid: existingUpstreamSqlChart.savedSqlUuid,
        slug: existingUpstreamSqlChart.slug,
        savedSqlVersionUuid: 'saved-sql-version-uuid',
    })),
    update: jest.fn(async () => ({
        savedSqlUuid: existingUpstreamSqlChart.savedSqlUuid,
        savedSqlVersionUuid: 'saved-sql-version-uuid',
    })),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => promotedChart.space),
    find: jest.fn(),
    getSpaceAncestors: jest.fn(async () => []),
    createSpace: jest.fn(async () => existingUpstreamChart.space),
    createSpaceWithAncestors: jest.fn(async () => existingUpstreamChart.space),
    getGroupAccess: jest.fn(async () => upstreamFullSpace.groupsAccess),
    addSpaceAccess: jest.fn(async () => {}),
    addSpaceGroupAccess: jest.fn(async () => {}),
    update: jest.fn(async () => {}),
    isRootSpace: jest.fn(async () => true),
};
const dashboardModel = {
    create: jest.fn(async () => existingUpstreamDashboard.dashboard),
    getByIdOrSlug: jest.fn(async () => promotedDashboardWithSqlTile.dashboard),
    find: jest.fn(async () => []),
};
const spacePermissionService = {
    getSpaceAccessContext: jest.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
        isPrivate: false,
        access: [],
    })),
    getAllSpaceAccessContext: jest.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
        isPrivate: false,
        access: upstreamFullSpace.access,
    })),
};
describe('PromoteService chart changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getChartChanges create chart and space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const changes = await service.getChartChanges(
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
            spacePath: promotedChart.space.path,
        });

        expect(changes.spaces[0].action).toBe(PromotionAction.CREATE);
        expect(changes.spaces[0].data).toEqual({
            ...promotedChart.space,
            projectUuid: missingUpstreamChart.projectUuid,
        });
    });
    test('getChartChanges create chart but no space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);
        const changes = await service.getChartChanges(promotedChart, {
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
            spacePath: promotedChart.space.path,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges chart with no changes', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);
        const changes = await service.getChartChanges(
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
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            upstreamSpace,
        ]);
        const changes = await service.getChartChanges(
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
            spacePath: promotedChart.space.path,
            updatedAt,
        });

        expect(changes.spaces[0].data).toEqual({
            ...existingUpstreamChart.space,
        });
    });

    test('getChartChanges update chart and create space', async () => {
        const updatedAt = new Date();
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const changes = await service.getChartChanges(
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
            spacePath: promotedChart.space.path,
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
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: {} as DashboardModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getPromotionDashboardChanges create empty dashboard and space', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
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
            spacePath: promotedDashboard.space.path,
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
            spacePath: promotedDashboard.space.path,
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
            spacePath: promotedChart.space.path,
            spaceUuid: promotedChart.space.uuid,
            projectUuid: missingUpstreamDashboard.projectUuid,
            dashboardUuid: null, // not within dashboard
            dashboardName: null,
        });
    });

    test('getPromotionDashboardChanges create dashboard with chart tiles in different spaces', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                {
                    ...promotedDashboard,
                    space: {
                        ...promotedDashboard.space,
                        slug: 'new-space',
                        path: 'new_space',
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
                path: 'new_space',
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
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);

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
            spacePath: promotedDashboard.space.path,
            uuid: existingUpstreamDashboard.dashboard?.uuid,
            spaceUuid: existingUpstreamDashboard.space?.uuid,
        });

        expect(changes.charts[0].data).toEqual({
            ...updatedPromotedChart,
            projectUuid: existingUpstreamDashboard.projectUuid,
            uuid: existingUpstreamChart.chart?.uuid,
            oldUuid: promotedChart.chart.uuid,
            spaceSlug: promotedChart.space.slug,
            spacePath: promotedChart.space.path,
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
            spacePath: promotedDashboard.space.path,
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
            spacePath: promotedChartWithinDashboard.space.path,
            spaceUuid: promotedChartWithinDashboard.space.uuid,
            projectUuid: missingUpstreamDashboard.projectUuid,
            dashboardUuid:
                promotedDashboardWithChartWithinDashboard.dashboard.uuid,
            dashboardName:
                promotedDashboardWithChartWithinDashboard.dashboard.name,
        });
    });

    test('getPromotionDashboardChanges discovers SQL chart tiles and SQL space requirements', async () => {
        (savedSqlModel.getByUuid as jest.Mock).mockImplementationOnce(
            async () => promotedSqlChart,
        );
        (savedSqlModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);

        const [changes, promotedCharts, promotedSqlCharts, sqlChanges] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithSqlTile,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(promotedCharts.length).toBe(1);
        expect(promotedSqlCharts.length).toBe(1);
        expect(sqlChanges.length).toBe(1);
        expect(sqlChanges[0].action).toBe(PromotionAction.CREATE);
        expect(sqlChanges[0].data).toEqual({
            oldUuid: promotedSqlChart.savedSqlUuid,
            uuid: promotedSqlChart.savedSqlUuid,
            slug: promotedSqlChart.slug,
            projectUuid: missingUpstreamDashboard.projectUuid,
            spaceSlug: promotedDashboard.space.slug,
            spacePath: promotedDashboard.space.path,
            unversionedData: {
                name: promotedSqlChart.name,
                description: promotedSqlChart.description,
                spaceUuid: promotedSqlChart.space.uuid,
            },
            versionedData: {
                sql: promotedSqlChart.sql,
                limit: promotedSqlChart.limit,
                config: promotedSqlChart.config,
            },
        });
    });
});

describe('PromoteService promoting and mutating changes', () => {
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,

        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('return same changes if no new space is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
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

        const newChanges = await service.upsertSpaces(
            user,
            promotedDashboard.projectUuid,
            changes,
        );

        expect(changes).toEqual(newChanges);
    });

    test('create space and update space uuid if a new space is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
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

        const newChanges = await service.upsertSpaces(
            user,
            promotedDashboard.projectUuid,
            changes,
        );

        expect(spaceModel.createSpace).toHaveBeenCalledTimes(1);
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledTimes(0);
        expect(spaceModel.addSpaceGroupAccess).toHaveBeenCalledTimes(0);

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

    test('create private space and add user as admin', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => []);
        const [changes] = await service.getPromotionDashboardChanges(
            user,
            promotedDashboardWithNewPrivateSpace,
            missingUpstreamDashboard,
        );

        expect(changes.spaces.length).toBe(1);
        expect(changes.spaces[0].action).toBe('create');
        expect(changes.spaces[0].data.isPrivate).toBe(true);

        (
            spaceModel.createSpaceWithAncestors as jest.Mock
        ).mockImplementationOnce(async () => ({
            ...promotedDashboardWithNewPrivateSpace.space,
            projectUuid: missingUpstreamDashboard.projectUuid,
            uuid: upstreamSpace?.uuid,
            rootSpaceUuid: upstreamSpace?.uuid,
        }));

        await service.upsertSpaces(
            user,
            promotedDashboardWithNewPrivateSpace.projectUuid,
            changes,
        );

        expect(spaceModel.createSpace).toHaveBeenCalledTimes(1);
        expect(spaceModel.createSpace).toHaveBeenCalledWith(
            {
                isPrivate: true,
                inheritParentPermissions: false,
                name: 'Private space',
                parentSpaceUuid: null,
            },
            {
                projectUuid: 'upstream-project-uuid',
                userId: 0,
                path: upstreamSpace?.path,
            },
        );
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledTimes(1);
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledWith(
            'upstream-space-uuid',
            'userUuid',
            'admin',
        );
        expect(spaceModel.addSpaceGroupAccess).toHaveBeenCalledTimes(1);
    });

    test('update space should not affect permissions', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithNewPrivateSpace,
                existingUpstreamDashboard,
            );

        expect(changes.spaces.length).toBe(1);
        expect(changes.spaces[0].action).toBe('update');
        expect(changes.spaces[0].data.isPrivate).toBe(false); // Existing space is not private, so it should be kept that way

        await service.upsertSpaces(
            user,
            promotedDashboardWithNewPrivateSpace.projectUuid,
            changes,
        );

        expect(spaceModel.update).toHaveBeenCalledTimes(1);
        expect(spaceModel.update).toHaveBeenCalledWith('upstream-space-uuid', {
            name: promotedDashboardWithNewPrivateSpace.space.name,
        });
        expect(spaceModel.addSpaceAccess).toHaveBeenCalledTimes(0);
        expect(spaceModel.addSpaceGroupAccess).toHaveBeenCalledTimes(0);
    });

    test('return same changes if no new dashboard is created', async () => {
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
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
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.charts[0].action).toBe('no changes');
        expect(changes.spaces[0].action).toBe('no changes');
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
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);

        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboardWithChartWithinDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.spaces.length).toBe(1);
        expect(changes.dashboards.length).toBe(1);
        expect(changes.charts[0].action).toBe('create');
        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.spaces[0].action).toBe('no changes');
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
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        const [changes, promotedCharts] =
            await service.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                missingUpstreamDashboard,
            );

        expect(changes.charts.length).toBe(1);
        expect(changes.charts[0].action).toBe('no changes');
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.dashboards[0].action).toBe('create');

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
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
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
        expect(changes.spaces[0].action).toBe('no changes');
        expect(changes.dashboards[0].action).toBe('create');
        expect(changes.charts[0].action).toBe('create');

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

    test('upsertSqlCharts create path remaps dashboard SQL tile savedSqlUuid', async () => {
        const dashboardWithOnlySqlTile = {
            ...promotedDashboardWithSqlTile,
            dashboard: {
                ...promotedDashboardWithSqlTile.dashboard,
                tiles: promotedDashboardWithSqlTile.dashboard.tiles.filter(
                    (tile) => tile.type === DashboardTileTypes.SQL_CHART,
                ),
            },
        };

        (savedSqlModel.getByUuid as jest.Mock).mockImplementationOnce(
            async () => promotedSqlChart,
        );
        (savedSqlModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (savedSqlModel.create as jest.Mock).mockImplementationOnce(
            async () => ({
                savedSqlUuid: 'new-upstream-sql-chart-uuid',
                slug: promotedSqlChart.slug,
                savedSqlVersionUuid: 'saved-sql-version-uuid',
            }),
        );

        const [changes, , , sqlChanges] =
            await service.getPromotionDashboardChanges(
                user,
                dashboardWithOnlySqlTile,
                missingUpstreamDashboard,
            );

        const newChanges = await service.upsertSqlCharts(
            user,
            changes,
            sqlChanges,
        );

        expect(savedSqlModel.create).toHaveBeenCalledTimes(1);
        expect(savedSqlModel.create).toHaveBeenCalledWith(
            user.userUuid,
            missingUpstreamDashboard.projectUuid,
            {
                name: promotedSqlChart.name,
                description: promotedSqlChart.description,
                spaceUuid: existingUpstreamDashboard.space?.uuid,
                sql: promotedSqlChart.sql,
                limit: promotedSqlChart.limit,
                config: promotedSqlChart.config,
                slug: promotedSqlChart.slug,
            },
        );

        const sqlTile = newChanges.dashboards[0].data.tiles.find(
            (tile) => tile.type === DashboardTileTypes.SQL_CHART,
        );
        expect(
            sqlTile?.type === DashboardTileTypes.SQL_CHART
                ? sqlTile.properties.savedSqlUuid
                : undefined,
        ).toBe('new-upstream-sql-chart-uuid');
    });

    test('upsertSqlCharts update/no-change paths remap to upstream SQL UUID without create', async () => {
        const dashboardWithOnlySqlTile = {
            ...promotedDashboardWithSqlTile,
            dashboard: {
                ...promotedDashboardWithSqlTile.dashboard,
                tiles: promotedDashboardWithSqlTile.dashboard.tiles.filter(
                    (tile) => tile.type === DashboardTileTypes.SQL_CHART,
                ),
            },
        };

        (savedSqlModel.getByUuid as jest.Mock).mockImplementationOnce(
            async () => ({
                ...promotedSqlChart,
                lastUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
                name: 'new sql chart title',
            }),
        );
        (savedSqlModel.find as jest.Mock).mockImplementationOnce(async () => [
            {
                saved_sql_uuid: existingUpstreamSqlChart.savedSqlUuid,
                name: 'old sql chart title',
                description: promotedSqlChart.description,
                slug: existingUpstreamSqlChart.slug,
                dashboard_uuid: null,
                created_at: existingUpstreamSqlChart.createdAt,
                last_version_updated_at: new Date('2024-01-01T00:00:00.000Z'),
                views_count: existingUpstreamSqlChart.views,
                first_viewed_at: existingUpstreamSqlChart.firstViewedAt,
                last_viewed_at: existingUpstreamSqlChart.lastViewedAt,
                sql: existingUpstreamSqlChart.sql,
                limit: existingUpstreamSqlChart.limit,
                config: existingUpstreamSqlChart.config,
                chart_kind: existingUpstreamSqlChart.chartKind,
                space_uuid: existingUpstreamSqlChart.space.uuid,
                path: promotedDashboard.space.path,
                project_uuid: missingUpstreamDashboard.projectUuid,
                organization_uuid: user.organizationUuid,
                updated_at: new Date('2024-01-01T00:00:00.000Z'),
                spaceName: existingUpstreamSqlChart.space.name,
                space_is_private: existingUpstreamSqlChart.space.isPrivate,
                dashboardName: null,
                created_by_user_uuid: user.userUuid,
                created_by_user_first_name: user.firstName,
                created_by_user_last_name: user.lastName,
                last_version_updated_by_user_uuid: user.userUuid,
                last_version_updated_by_user_first_name: user.firstName,
                last_version_updated_by_user_last_name: user.lastName,
            },
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);
        (spaceModel.find as jest.Mock).mockImplementationOnce(async () => [
            existingUpstreamDashboard.space,
        ]);

        const [changes, , , sqlChanges] =
            await service.getPromotionDashboardChanges(
                user,
                dashboardWithOnlySqlTile,
                missingUpstreamDashboard,
            );

        expect(sqlChanges[0].action).toBe(PromotionAction.UPDATE);
        expect(sqlChanges[0].data.oldUuid).toBe(promotedSqlChart.savedSqlUuid);
        expect(sqlChanges[0].data.uuid).toBe(
            existingUpstreamSqlChart.savedSqlUuid,
        );

        const newChanges = await service.upsertSqlCharts(
            user,
            changes,
            sqlChanges,
        );

        expect(savedSqlModel.create).toHaveBeenCalledTimes(0);
        expect(savedSqlModel.update).toHaveBeenCalledTimes(1);
        expect(savedSqlModel.update).toHaveBeenCalledWith({
            userUuid: user.userUuid,
            savedSqlUuid: existingUpstreamSqlChart.savedSqlUuid,
            sqlChart: {
                unversionedData: {
                    name: 'new sql chart title',
                    description: promotedSqlChart.description,
                    spaceUuid: existingUpstreamDashboard.space?.uuid,
                },
                versionedData: {
                    sql: promotedSqlChart.sql,
                    limit: promotedSqlChart.limit,
                    config: promotedSqlChart.config,
                },
            },
        });

        const sqlTile = newChanges.dashboards[0].data.tiles.find(
            (tile) => tile.type === DashboardTileTypes.SQL_CHART,
        );
        expect(
            sqlTile?.type === DashboardTileTypes.SQL_CHART
                ? sqlTile.properties.savedSqlUuid
                : undefined,
        ).toBe(existingUpstreamSqlChart.savedSqlUuid);
    });

    test('getPromoteDashboardDiff includes sqlCharts for SQL runner tiles', async () => {
        const dashboardWithOnlySqlTile = {
            ...promotedDashboardWithSqlTile.dashboard,
            tiles: promotedDashboardWithSqlTile.dashboard.tiles.filter(
                (tile) => tile.type === DashboardTileTypes.SQL_CHART,
            ),
        };

        (projectModel.getSummary as jest.Mock).mockImplementationOnce(
            async () => ({
                upstreamProjectUuid: existingUpstreamDashboard.projectUuid,
            }),
        );
        (dashboardModel.getByIdOrSlug as jest.Mock).mockImplementationOnce(
            async () => dashboardWithOnlySqlTile,
        );
        (dashboardModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );
        (spaceModel.find as jest.Mock).mockImplementation(async () => []);
        (savedSqlModel.getByUuid as jest.Mock).mockImplementationOnce(
            async () => promotedSqlChart,
        );
        (savedSqlModel.find as jest.Mock).mockImplementationOnce(
            async () => [],
        );

        const changes = await service.getPromoteDashboardDiff(
            user,
            dashboardWithOnlySqlTile.uuid,
        );

        expect(changes.sqlCharts).toEqual([
            {
                action: PromotionAction.CREATE,
                data: {
                    uuid: promotedSqlChart.savedSqlUuid,
                    oldUuid: promotedSqlChart.savedSqlUuid,
                    slug: promotedSqlChart.slug,
                    projectUuid: existingUpstreamDashboard.projectUuid,
                    name: promotedSqlChart.name,
                    description: promotedSqlChart.description,
                    spaceSlug: promotedDashboard.space.slug,
                    spacePath: promotedDashboard.space.path,
                },
            },
        ]);
    });
});
