import { Ability } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartType,
    DashboardTileTypes,
    FeatureNotEnabledError,
    ForbiddenError,
    getUserAbilityBuilder,
    OrganizationMemberRole,
    PromotionAction,
    type ComposerChart,
    type ComposerChartOwner,
    type DashboardDAO,
    type DashboardTile,
    type PossibleAbilities,
    type RegisteredAccount,
    type SpaceSummaryBase,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { PromoteService } from './PromoteService';

const organizationUuid = 'organization';
const userUuid = 'promoter';
const previewProjectUuid = 'preview-project';
const upstreamProjectUuid = 'upstream-project';
const upstreamDashboardUuid = 'upstream-dashboard';
const upstreamChartUuid = 'upstream-composer-chart';
const sharedSpaceUuid = 'preview-shared-space';
const upstreamSharedSpaceUuid = 'upstream-shared-space';

const account = {
    authentication: { type: 'session' },
    organization: { organizationUuid, name: 'Org' },
    user: {
        id: userUuid,
        userUuid,
        userId: 1,
        role: OrganizationMemberRole.ADMIN,
        ability: getUserAbilityBuilder({
            user: {
                userUuid,
                organizationUuid,
                role: OrganizationMemberRole.ADMIN,
            },
            projectProfiles: [],
            permissionsConfig: { pat: { enabled: false, allowedOrgRoles: [] } },
        }).builder.build(),
    },
    isAnonymousUser: () => false,
    isServiceAccount: () => false,
} as unknown as RegisteredAccount;

const space = (
    projectUuid: string,
    uuid: string,
    path = 'reports',
): SpaceSummaryBase =>
    ({
        organizationUuid,
        projectUuid,
        uuid,
        name: path === 'reports' ? 'Reports' : 'Shared',
        slug: path,
        path,
        parentSpaceUuid: null,
        inheritParentPermissions: true,
    }) as SpaceSummaryBase;

const composerTile: DashboardTile = {
    uuid: 'composer-tile',
    type: DashboardTileTypes.COMPOSER_CHART,
    x: 0,
    y: 0,
    h: 3,
    w: 6,
    tabUuid: undefined,
    properties: {
        title: 'Revenue',
        hideTitle: false,
        composerChartUuid: 'preview-composer-chart',
        chartName: 'Revenue',
        chartSlug: 'revenue',
    },
};

const dashboard = (
    uuid: string,
    projectUuid: string,
    spaceUuid: string,
): DashboardDAO =>
    ({
        organizationUuid,
        projectUuid,
        uuid,
        versionUuid: `${uuid}-version`,
        dashboardVersionId: 1,
        name: 'Sales',
        description: '',
        slug: 'sales',
        spaceUuid,
        spaceName: 'Reports',
        tiles: [composerTile],
        tabs: [],
        filters: { metrics: [], dimensions: [], tableCalculations: [] },
        owner: null,
        updatedAt: new Date('2026-11-01'),
    }) as unknown as DashboardDAO;

const sourceDashboard = dashboard(
    'preview-dashboard',
    previewProjectUuid,
    'preview-space',
);
const scoped = { projectUuid: previewProjectUuid };

const pipeline = { schemaVersion: 1, nodes: [{ id: 'orders' }] };
const storedChart = (dataAppVizUuid?: string) =>
    ({
        schemaVersion: 1,
        columns: [],
        chartConfig: dataAppVizUuid
            ? {
                  type: ChartType.DATA_APP_VIZ,
                  config: { dataAppVizUuid, dataAppVizVersion: 1 },
              }
            : { type: ChartType.TABLE },
        pivotConfig: null,
        tableConfig: { columnOrder: [] },
    }) as unknown as ComposerChart['chart'];

const composerChart = (overrides: Partial<ComposerChart>): ComposerChart =>
    ({
        uuid: 'preview-composer-chart',
        projectUuid: previewProjectUuid,
        owner: { type: 'dashboard', dashboardUuid: sourceDashboard.uuid },
        name: 'Revenue',
        description: null,
        slug: 'revenue',
        pipeline,
        chart: storedChart(),
        ...overrides,
    }) as ComposerChart;

const setup = ({
    upstreamDashboardExists = false,
    upstreamChart = null as ComposerChart | null,
    upstreamChartOwner = {
        type: 'dashboard',
        dashboardUuid: upstreamDashboardUuid,
    },
    sourceChart = composerChart({}),
    upstreamSharedSpaceExists = true,
}: {
    upstreamDashboardExists?: boolean;
    upstreamChart?: ComposerChart | null;
    upstreamChartOwner?: ComposerChartOwner;
    sourceChart?: ComposerChart;
    upstreamSharedSpaceExists?: boolean;
} = {}) => {
    const upstreamDashboard = dashboard(
        upstreamDashboardUuid,
        upstreamProjectUuid,
        'upstream-space',
    );
    const dashboardModel = {
        getByIdOrSlug: vi.fn(async () => sourceDashboard),
        find: vi.fn(async () =>
            upstreamDashboardExists ? [upstreamDashboard] : [],
        ),
        create: vi.fn(async (_space: string, data: DashboardDAO) => ({
            ...upstreamDashboard,
            tiles: data.tiles,
        })),
        addVersion: vi.fn(async (_uuid: string, data: DashboardDAO) => ({
            ...upstreamDashboard,
            tiles: data.tiles,
        })),
        update: vi.fn(async () => undefined),
        renameSlug: vi.fn(async () => undefined),
        getOrphanedCharts: vi.fn(async () => []),
    };
    const composerChartModel = {
        get: vi.fn(async (uuid: string) =>
            uuid === sourceChart.uuid ? sourceChart : upstreamChart!,
        ),
        findIdentityBySlug: vi.fn(async () =>
            upstreamChart
                ? {
                      uuid: upstreamChart.uuid,
                      deleted: false,
                      owner: upstreamChartOwner,
                  }
                : null,
        ),
        getOwner: vi.fn(async (uuid: string) =>
            uuid === sourceChart.uuid
                ? { projectUuid: previewProjectUuid, owner: sourceChart.owner }
                : {
                      projectUuid: upstreamProjectUuid,
                      owner: upstreamChartOwner,
                  },
        ),
        deleteOrphans: vi.fn(async () => undefined),
    };
    const composerChartService = {
        isEnabled: vi.fn(async () => true),
        preflightDashboard: vi.fn(async () => undefined),
        preflightSpaceWrite: vi.fn(async () => undefined),
        preflightPipeline: vi.fn(async () => undefined),
        writeFromCode: vi.fn(async () => upstreamChartUuid),
    };
    const appGenerateService = {
        getDataAppPromoteChanges: vi.fn(async () => []),
        promoteAppsForDashboard: vi.fn(
            async (_user: unknown, _project: string, appUuids: string[]) =>
                appUuids.map((appUuid) => ({
                    sourceAppUuid: appUuid,
                    upstreamAppUuid: `upstream-${appUuid}`,
                    upstreamAppVersion: 7,
                })),
        ),
    };
    const spaceModel = {
        getSpaceSummary: vi.fn(async (uuid: string) =>
            uuid === sharedSpaceUuid
                ? space(previewProjectUuid, sharedSpaceUuid, 'shared')
                : space(previewProjectUuid, 'preview-space'),
        ),
        getSpaceAncestors: vi.fn(async () => []),
        find: vi.fn(async ({ path }: { path: string }) => {
            if (path !== 'shared') {
                return [space(upstreamProjectUuid, 'upstream-space')];
            }
            return upstreamSharedSpaceExists
                ? [
                      space(
                          upstreamProjectUuid,
                          upstreamSharedSpaceUuid,
                          'shared',
                      ),
                  ]
                : [];
        }),
        createSpace: vi.fn(async (_data: unknown, { path }: { path: string }) =>
            space(upstreamProjectUuid, upstreamSharedSpaceUuid, path),
        ),
        update: vi.fn(async () => undefined),
    };
    const service = new PromoteService({
        agentActionLogModel: { insert: vi.fn() },
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            getSummary: vi.fn(async (projectUuid: string) => ({
                projectUuid,
                organizationUuid,
                upstreamProjectUuid,
            })),
            getUpstreamDashboardUuidFromPreview: vi.fn(async () => null),
            getConnectionRoute: vi.fn(async () => 'single'),
        } as never,
        spaceModel: spaceModel as never,
        savedChartModel: {} as never,
        savedSqlModel: {} as never,
        dashboardModel: dashboardModel as never,
        spacePermissionService: {
            resolveAccess: vi.fn(async () => ({
                organizationUuid,
                projectUuid: upstreamProjectUuid,
                inheritsFromOrgOrProject: true,
                access: [],
            })),
        } as never,
        warehouseConnectionModel: {} as never,
        getDocumentService: () => ({}) as never,
        appModel: {} as never,
        getAppGenerateService: () => appGenerateService as never,
        composerChartModel: composerChartModel as never,
        getComposerChartService: () => composerChartService as never,
    });
    return {
        service,
        dashboardModel,
        spaceModel,
        composerChartModel,
        composerChartService,
        appGenerateService,
    };
};

const promotedComposerTileUuid = (tiles: DashboardTile[]) =>
    tiles.flatMap((tile) =>
        tile.type === DashboardTileTypes.COMPOSER_CHART
            ? [tile.properties.composerChartUuid]
            : [],
    );

describe('promoting a dashboard with composer charts', () => {
    test('the diff lists a chart the upstream lacks as created, after checking the pipeline against upstream', async () => {
        const { service, composerChartService } = setup();

        const changes = await service.getPromoteDashboardDiff(
            account,
            sourceDashboard.uuid,
            scoped,
        );

        expect(changes.composerCharts).toEqual([
            {
                action: PromotionAction.CREATE,
                data: expect.objectContaining({
                    oldUuid: 'preview-composer-chart',
                    slug: 'revenue',
                    name: 'Revenue',
                    projectUuid: upstreamProjectUuid,
                }),
            },
        ]);
        expect(composerChartService.preflightPipeline).toHaveBeenCalledWith(
            account,
            { organizationUuid, projectUuid: upstreamProjectUuid },
            pipeline,
        );
    });

    test('creates the chart on the new upstream dashboard and points the tile at it', async () => {
        const { service, dashboardModel, composerChartService } = setup();

        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);

        expect(
            promotedComposerTileUuid(
                dashboardModel.create.mock.calls[0][1].tiles,
            ),
        ).toEqual([]);
        expect(composerChartService.writeFromCode).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            {
                slug: 'revenue',
                owner: {
                    type: 'dashboard',
                    dashboardUuid: upstreamDashboardUuid,
                },
                name: 'Revenue',
                description: null,
                pipeline,
                chart: storedChart(),
            },
        );
        expect(
            promotedComposerTileUuid(
                dashboardModel.addVersion.mock.calls[0][1].tiles,
            ),
        ).toEqual([upstreamChartUuid]);
    });

    test('a re-promote updates the upstream chart in place and removes composer charts no longer shown', async () => {
        const {
            service,
            dashboardModel,
            composerChartModel,
            composerChartService,
        } = setup({
            upstreamDashboardExists: true,
            upstreamChart: composerChart({
                uuid: upstreamChartUuid,
                projectUuid: upstreamProjectUuid,
                owner: {
                    type: 'dashboard',
                    dashboardUuid: upstreamDashboardUuid,
                },
                pipeline: { schemaVersion: 1, nodes: [] } as never,
            }),
        });

        const changes = await service.getPromoteDashboardDiff(
            account,
            sourceDashboard.uuid,
            scoped,
        );
        expect(changes.composerCharts?.[0].action).toBe(PromotionAction.UPDATE);

        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);

        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            expect.objectContaining({
                slug: 'revenue',
                owner: {
                    type: 'dashboard',
                    dashboardUuid: upstreamDashboardUuid,
                },
                pipeline,
            }),
        );
        expect(
            promotedComposerTileUuid(
                dashboardModel.addVersion.mock.calls[0][1].tiles,
            ),
        ).toEqual([upstreamChartUuid]);
        expect(composerChartModel.deleteOrphans).toHaveBeenCalledWith(
            upstreamDashboardUuid,
            new Set(),
        );
    });

    test('an unchanged chart is left alone', async () => {
        const { service, composerChartService } = setup({
            upstreamDashboardExists: true,
            upstreamChart: composerChart({
                uuid: upstreamChartUuid,
                projectUuid: upstreamProjectUuid,
                owner: {
                    type: 'dashboard',
                    dashboardUuid: upstreamDashboardUuid,
                },
            }),
        });

        const changes = await service.getPromoteDashboardDiff(
            account,
            sourceDashboard.uuid,
            scoped,
        );
        expect(changes.composerCharts?.[0].action).toBe(
            PromotionAction.NO_CHANGES,
        );
        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test('refuses before any write when the user cannot save the pipeline upstream', async () => {
        const { service, dashboardModel, composerChartService } = setup();
        composerChartService.preflightPipeline.mockRejectedValueOnce(
            new ForbiddenError('You need SQL runner permission'),
        );

        await expect(
            service.promoteDashboard(account, sourceDashboard.uuid, scoped),
        ).rejects.toThrow('You need SQL runner permission');
        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test('with the composer-charts flag off, refuses even when every composer chart is unchanged', async () => {
        const { service, dashboardModel, composerChartService } = setup({
            upstreamDashboardExists: true,
            upstreamChart: composerChart({
                uuid: upstreamChartUuid,
                projectUuid: upstreamProjectUuid,
                owner: {
                    type: 'dashboard',
                    dashboardUuid: upstreamDashboardUuid,
                },
            }),
        });
        composerChartService.isEnabled.mockResolvedValue(false);

        await expect(
            service.promoteDashboard(account, sourceDashboard.uuid, scoped),
        ).rejects.toBeInstanceOf(FeatureNotEnabledError);
        expect(dashboardModel.addVersion).not.toHaveBeenCalled();
    });

    test('refuses without reading upstream charts when the user cannot update the upstream dashboard', async () => {
        const { service, composerChartModel, composerChartService } = setup({
            upstreamDashboardExists: true,
        });
        composerChartService.preflightDashboard.mockRejectedValue(
            new ForbiddenError(
                "You don't have permission to update this dashboard",
            ),
        );

        await expect(
            service.getPromoteDashboardDiff(
                account,
                sourceDashboard.uuid,
                scoped,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            service.promoteDashboard(account, sourceDashboard.uuid, scoped),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(composerChartService.preflightDashboard).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            upstreamDashboardUuid,
        );
        expect(composerChartModel.findIdentityBySlug).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test('refuses before any write when the user cannot save charts where a new upstream dashboard goes', async () => {
        const { service, dashboardModel, composerChartService } = setup();
        const cannotSaveCharts = {
            ...account,
            user: {
                ...account.user,
                ability: new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'all' },
                    { action: 'create', subject: 'SavedChart', inverted: true },
                ]),
            },
        } as RegisteredAccount;

        await expect(
            service.promoteDashboard(
                cannotSaveCharts,
                sourceDashboard.uuid,
                scoped,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test('refuses when the slug belongs to a composer chart on another upstream dashboard', async () => {
        const { service, dashboardModel, composerChartService } = setup({
            upstreamChart: composerChart({
                uuid: 'someone-elses-chart',
                projectUuid: upstreamProjectUuid,
            }),
            upstreamChartOwner: {
                type: 'dashboard',
                dashboardUuid: 'another-dashboard',
            },
        });

        await expect(
            service.promoteDashboard(account, sourceDashboard.uuid, scoped),
        ).rejects.toBeInstanceOf(AlreadyExistsError);
        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test("refuses before any write when a tile shows a space's chart", async () => {
        const { service, dashboardModel, composerChartService } = setup({
            sourceChart: composerChart({
                owner: { type: 'space', spaceUuid: 'preview-space' },
            }),
        });

        await expect(
            service.promoteDashboard(account, sourceDashboard.uuid, scoped),
        ).rejects.toThrow('cannot be promoted yet');
        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test('carries the custom chart type the chart uses', async () => {
        const { service, appGenerateService, composerChartService } = setup({
            sourceChart: composerChart({ chart: storedChart('pills') }),
        });

        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);

        expect(appGenerateService.promoteAppsForDashboard).toHaveBeenCalledWith(
            expect.anything(),
            previewProjectUuid,
            ['pills'],
        );
        expect(composerChartService.writeFromCode).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            expect.objectContaining({
                chart: expect.objectContaining({
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: 'upstream-pills',
                            dataAppVizVersion: 7,
                        },
                    },
                }),
            }),
        );
    });
});

describe('promoting a dashboard showing a chart a space owns', () => {
    const referenced = composerChart({
        owner: { type: 'space', spaceUuid: sharedSpaceUuid },
    });
    const upstreamSpaceChart = (pipelineOverride?: unknown) =>
        composerChart({
            uuid: upstreamChartUuid,
            projectUuid: upstreamProjectUuid,
            owner: { type: 'space', spaceUuid: upstreamSharedSpaceUuid },
            ...(pipelineOverride !== undefined && {
                pipeline: pipelineOverride as never,
            }),
        });

    test('the diff lists the chart as created in the matching upstream space', async () => {
        const { service } = setup({
            sourceChart: referenced,
            upstreamSharedSpaceExists: false,
        });

        const changes = await service.getPromoteDashboardDiff(
            account,
            sourceDashboard.uuid,
            scoped,
        );

        expect(changes.composerCharts).toEqual([
            {
                action: PromotionAction.CREATE,
                data: expect.objectContaining({
                    oldUuid: referenced.uuid,
                    spacePath: 'shared',
                }),
            },
        ]);
        expect(changes.spaces).toContainEqual({
            action: PromotionAction.CREATE,
            data: expect.objectContaining({
                path: 'shared',
                projectUuid: upstreamProjectUuid,
            }),
        });
    });

    test('creates the chart in the matching upstream space and points the tile at it', async () => {
        const { service, dashboardModel, composerChartService } = setup({
            sourceChart: referenced,
        });

        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);

        expect(composerChartService.writeFromCode).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            expect.objectContaining({
                slug: 'revenue',
                owner: { type: 'space', spaceUuid: upstreamSharedSpaceUuid },
                pipeline,
            }),
        );
        expect(
            promotedComposerTileUuid(
                dashboardModel.addVersion.mock.calls[0][1].tiles,
            ),
        ).toEqual([upstreamChartUuid]);
    });

    test('creates the upstream space by path when it is missing', async () => {
        const { service, spaceModel, composerChartService } = setup({
            sourceChart: referenced,
            upstreamSharedSpaceExists: false,
        });

        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);

        expect(spaceModel.createSpace).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Shared' }),
            expect.objectContaining({
                projectUuid: upstreamProjectUuid,
                path: 'shared',
            }),
        );
        expect(composerChartService.writeFromCode).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            expect.objectContaining({
                owner: { type: 'space', spaceUuid: upstreamSharedSpaceUuid },
            }),
        );
    });

    test('updates an upstream match a space owns where it is, checked as an update there', async () => {
        const { service, spaceModel, composerChartService } = setup({
            sourceChart: referenced,
            upstreamDashboardExists: true,
            upstreamChart: upstreamSpaceChart({ schemaVersion: 1, nodes: [] }),
            upstreamChartOwner: {
                type: 'space',
                spaceUuid: upstreamSharedSpaceUuid,
            },
        });

        const changes = await service.getPromoteDashboardDiff(
            account,
            sourceDashboard.uuid,
            scoped,
        );
        expect(changes.composerCharts?.[0].action).toBe(PromotionAction.UPDATE);

        await service.promoteDashboard(account, sourceDashboard.uuid, scoped);

        expect(composerChartService.preflightSpaceWrite).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            upstreamSharedSpaceUuid,
            upstreamChartUuid,
        );
        expect(composerChartService.writeFromCode).toHaveBeenCalledWith(
            account,
            upstreamProjectUuid,
            expect.objectContaining({
                slug: 'revenue',
                owner: { type: 'space', spaceUuid: upstreamSharedSpaceUuid },
                pipeline,
            }),
        );
        expect(spaceModel.createSpace).not.toHaveBeenCalled();
    });

    test("a chart in the dashboard's own space lists that space once", async () => {
        const { service } = setup({
            sourceChart: composerChart({
                owner: { type: 'space', spaceUuid: 'preview-space' },
            }),
        });

        const changes = await service.getPromoteDashboardDiff(
            account,
            sourceDashboard.uuid,
            scoped,
        );

        expect(
            changes.spaces.filter((change) => change.data.path === 'reports'),
        ).toHaveLength(1);
        expect(changes.composerCharts?.[0].data.spacePath).toBe('reports');
    });

    test.each([
        ['the upstream of this dashboard', upstreamDashboardUuid],
        ['another dashboard', 'another-dashboard'],
    ])(
        'refuses an upstream match owned by %s, before any write',
        async (_, ownerDashboardUuid) => {
            const { service, dashboardModel, composerChartService } = setup({
                sourceChart: referenced,
                upstreamChart: upstreamSpaceChart(),
                upstreamChartOwner: {
                    type: 'dashboard',
                    dashboardUuid: ownerDashboardUuid,
                },
            });

            await expect(
                service.promoteDashboard(account, sourceDashboard.uuid, scoped),
            ).rejects.toBeInstanceOf(AlreadyExistsError);
            expect(dashboardModel.create).not.toHaveBeenCalled();
            expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
        },
    );

    test('refuses before any write when the user cannot save charts in the upstream space', async () => {
        const { service, dashboardModel, composerChartService } = setup({
            sourceChart: referenced,
        });
        composerChartService.preflightSpaceWrite.mockRejectedValue(
            new ForbiddenError(
                "You don't have permission to save composer charts here",
            ),
        );

        await expect(
            service.promoteDashboard(account, sourceDashboard.uuid, scoped),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });

    test('refuses before any write when the user cannot promote charts from its space', async () => {
        const { service, dashboardModel, composerChartService } = setup({
            sourceChart: referenced,
        });
        const cannotPromoteCharts = {
            ...account,
            user: {
                ...account.user,
                ability: new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'all' },
                    {
                        action: 'promote',
                        subject: 'SavedChart',
                        inverted: true,
                    },
                ]),
            },
        } as RegisteredAccount;

        await expect(
            service.promoteDashboard(
                cannotPromoteCharts,
                sourceDashboard.uuid,
                scoped,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(dashboardModel.create).not.toHaveBeenCalled();
        expect(composerChartService.writeFromCode).not.toHaveBeenCalled();
    });
});
