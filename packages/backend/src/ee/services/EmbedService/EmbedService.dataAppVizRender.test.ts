import {
    ChartType,
    DashboardTileTypes,
    ForbiddenError,
    NotFoundError,
    type AnonymousAccount,
    type DataAppVizSchema,
    type EmbedContent,
} from '@lightdash/common';
import { verifyPreviewToken } from '../../../routers/appPreviewToken';
import { EmbedService } from './EmbedService';
import { EmbedServiceArgumentsMock } from './EmbedService.mock';

const PROJECT_UUID = 'project-1';
const ORGANIZATION_UUID = 'org-1';
const DATA_APP_VIZ_UUID = 'data-app-viz-1';
const SAVED_CHART_UUID = 'saved-chart-1';

const vizSchema: DataAppVizSchema = {
    fields: [],
    configOptions: [],
    colorPalette: null,
};

const makeDataAppVizRow = () => ({
    app_id: DATA_APP_VIZ_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORGANIZATION_UUID,
    space_uuid: null,
    created_by_user_uuid: 'author-1',
});

const makeVersion = (overrides: Record<string, unknown> = {}) => ({
    app_version_id: 'app-version-1',
    app_id: DATA_APP_VIZ_UUID,
    version: 1,
    prompt: 'build a chart',
    status: 'ready',
    error: null,
    status_message: null,
    status_history: [],
    status_updated_at: new Date('2026-06-30'),
    resources: null,
    dependencies: null,
    viz_schema: vizSchema,
    generation_usage: null,
    created_at: new Date('2026-06-30'),
    created_by_user_uuid: 'author-1',
    ...overrides,
});

const makeSavedChart = (overrides: Record<string, unknown> = {}) => ({
    uuid: SAVED_CHART_UUID,
    projectUuid: PROJECT_UUID,
    tableName: 'orders',
    metricQuery: {},
    chartConfig: {
        type: ChartType.DATA_APP_VIZ,
        config: {
            dataAppVizUuid: DATA_APP_VIZ_UUID,
            fieldMapping: {},
        },
    },
    ...overrides,
});

const makeAccount = (
    content: Partial<EmbedContent> & Pick<EmbedContent, 'type'>,
): AnonymousAccount => {
    const resolvedContent = {
        chartUuids: [],
        explores: [],
        ...content,
    } as EmbedContent;

    // No ability here on purpose: the JWT's content binding is the chart
    // authorization for these routes, so nothing consults a CASL ability.
    return {
        authentication: { type: 'jwt', source: 'embed-token' },
        user: {
            id: 'embed-user-1',
            type: 'anonymous',
        },
        organization: { organizationUuid: ORGANIZATION_UUID },
        access: {
            content: resolvedContent,
        },
        embed: { projectUuid: PROJECT_UUID },
        isAnonymousUser: vi.fn().mockReturnValue(true),
        isJwtUser: vi.fn().mockReturnValue(true),
    } as unknown as AnonymousAccount;
};

const chartAccount = () =>
    makeAccount({ type: 'chart', chartUuids: [SAVED_CHART_UUID] });

const dashboardAccount = () =>
    makeAccount({ type: 'dashboard', dashboardUuid: 'dashboard-1' });

const testLightdashSecrets = {
    active: 'test-secret',
    fallbacks: [],
    all: ['test-secret'],
};

const buildService = ({
    appModel = {},
    savedChartModel = {},
    dashboardModel = {},
    featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    },
}: {
    appModel?: Record<string, unknown>;
    savedChartModel?: Record<string, unknown>;
    dashboardModel?: Record<string, unknown>;
    featureFlagModel?: Record<string, unknown>;
}) =>
    new EmbedService({
        ...EmbedServiceArgumentsMock,
        lightdashConfig: {
            ...EmbedServiceArgumentsMock.lightdashConfig,
            lightdashSecret: 'test-secret',
            lightdashSecrets: testLightdashSecrets,
        },
        appModel,
        savedChartModel,
        dashboardModel,
        featureFlagModel,
        externalConnectionModel: {
            getBrowserImageOrigins: vi.fn().mockResolvedValue([]),
        },
    } as never);

describe('EmbedService data app viz rendering', () => {
    it('resolves the template-filtered viz before the feature flag or chart authorization', async () => {
        const featureFlagModel = { get: vi.fn() };
        const savedChartModel = { get: vi.fn() };
        const service = buildService({
            appModel: {
                findVisualizationApp: vi.fn().mockResolvedValue(undefined),
            },
            featureFlagModel,
            savedChartModel,
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                'non-visualization-data-app',
            ),
        ).rejects.toThrow(NotFoundError);

        expect(featureFlagModel.get).not.toHaveBeenCalled();
        expect(savedChartModel.get).not.toHaveBeenCalled();
    });

    it('serves metadata to the standalone chart named by the JWT', async () => {
        const savedChartModel = {
            get: vi.fn().mockResolvedValue(makeSavedChart()),
        };
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getLatestVersion: vi
                    .fn()
                    .mockResolvedValue(
                        makeVersion({ version: 2, status: 'building' }),
                    ),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion()),
            },
            savedChartModel,
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).resolves.toEqual({
            state: 'ready',
            version: 1,
            schema: vizSchema,
            latestBuildInProgress: true,
        });
        expect(savedChartModel.get).toHaveBeenCalledWith(SAVED_CHART_UUID);
    });

    it('renders the project chart type version pinned by the embedded chart', async () => {
        const appModel = {
            findVisualizationApp: vi
                .fn()
                .mockResolvedValue(makeDataAppVizRow()),
            getVersion: vi.fn().mockResolvedValue(makeVersion({ version: 2 })),
            getLatestVersion: vi
                .fn()
                .mockResolvedValue(makeVersion({ version: 4 })),
            getLatestRenderableDataAppVizVersion: vi
                .fn()
                .mockResolvedValue(makeVersion({ version: 4 })),
        };
        const service = buildService({
            appModel,
            savedChartModel: {
                get: vi.fn().mockResolvedValue(
                    makeSavedChart({
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                dataAppVizUuid: DATA_APP_VIZ_UUID,
                                dataAppVizVersion: 2,
                                fieldMapping: {},
                            },
                        },
                    }),
                ),
            },
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).resolves.toMatchObject({ state: 'ready', version: 2 });
        expect(appModel.getVersion).toHaveBeenCalledWith(DATA_APP_VIZ_UUID, 2);
        expect(appModel.getLatestVersion).not.toHaveBeenCalled();
    });

    it('rejects a preview token for a version other than the embedded chart pin', async () => {
        const appModel = {
            findVisualizationApp: vi
                .fn()
                .mockResolvedValue(makeDataAppVizRow()),
            getVersion: vi.fn().mockResolvedValue(makeVersion({ version: 4 })),
        };
        const service = buildService({
            appModel,
            savedChartModel: {
                get: vi.fn().mockResolvedValue(
                    makeSavedChart({
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                dataAppVizUuid: DATA_APP_VIZ_UUID,
                                dataAppVizVersion: 2,
                                fieldMapping: {},
                            },
                        },
                    }),
                ),
            },
        });

        await expect(
            service.getEmbedDataAppVizPreviewToken(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
                4,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(appModel.getVersion).not.toHaveBeenCalled();
    });

    it('rejects a historical preview token for an unpinned legacy chart', async () => {
        const appModel = {
            findVisualizationApp: vi
                .fn()
                .mockResolvedValue(makeDataAppVizRow()),
            getLatestRenderableDataAppVizVersion: vi
                .fn()
                .mockResolvedValue(makeVersion({ version: 4 })),
            getVersion: vi.fn().mockResolvedValue(makeVersion({ version: 2 })),
        };
        const service = buildService({
            appModel,
            savedChartModel: {
                get: vi.fn().mockResolvedValue(makeSavedChart()),
            },
        });

        await expect(
            service.getEmbedDataAppVizPreviewToken(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
                2,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a different chart than the standalone chart named by the JWT', async () => {
        const savedChartModel = { get: vi.fn() };
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            savedChartModel,
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                'another-chart',
                DATA_APP_VIZ_UUID,
            ),
        ).rejects.toThrow('Not authorized to access this chart');
        expect(savedChartModel.get).not.toHaveBeenCalled();
    });

    it('serves metadata when the saved chart is a tile on the authorized dashboard', async () => {
        const dashboardModel = {
            getByIdOrSlug: vi.fn().mockResolvedValue({
                uuid: 'dashboard-1',
                tiles: [
                    {
                        uuid: 'tile-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { savedChartUuid: SAVED_CHART_UUID },
                    },
                ],
            }),
        };
        const savedChartModel = {
            get: vi.fn().mockResolvedValue(makeSavedChart()),
        };
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getLatestVersion: vi.fn().mockResolvedValue(makeVersion()),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion()),
            },
            dashboardModel,
            savedChartModel,
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                dashboardAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).resolves.toMatchObject({ state: 'ready', version: 1 });
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            'dashboard-1',
            { projectUuid: PROJECT_UUID },
        );
    });

    it('rejects a saved chart that is not a tile on the authorized dashboard', async () => {
        const savedChartModel = { get: vi.fn() };
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            dashboardModel: {
                getByIdOrSlug: vi.fn().mockResolvedValue({
                    uuid: 'dashboard-1',
                    tiles: [],
                }),
            },
            savedChartModel,
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                dashboardAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).rejects.toThrow('Tile for saved chart');
        expect(savedChartModel.get).not.toHaveBeenCalled();
    });

    it('rejects a saved chart that does not reference the requested viz', async () => {
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            savedChartModel: {
                get: vi.fn().mockResolvedValue(
                    makeSavedChart({
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                dataAppVizUuid: 'another-viz',
                                fieldMapping: {},
                            },
                        },
                    }),
                ),
            },
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a saved chart that is not a data app visualization', async () => {
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            savedChartModel: {
                get: vi.fn().mockResolvedValue(
                    makeSavedChart({
                        chartConfig: {
                            type: ChartType.TABLE,
                        },
                    }),
                ),
            },
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('checks EnableDataApps before loading the authorized saved chart', async () => {
        const savedChartModel = { get: vi.fn() };
        const service = buildService({
            appModel: {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: false }),
            },
            savedChartModel,
        });

        await expect(
            service.getEmbedDataAppVizRenderMetadata(
                chartAccount(),
                PROJECT_UUID,
                SAVED_CHART_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(savedChartModel.get).not.toHaveBeenCalled();
    });

    it.each(['dataApp', 'aiAgent', 'metricsCatalog', 'apiAccess'] as const)(
        'rejects %s embed JWTs',
        async (type) => {
            const savedChartModel = { get: vi.fn() };
            const service = buildService({
                appModel: {
                    findVisualizationApp: vi
                        .fn()
                        .mockResolvedValue(makeDataAppVizRow()),
                },
                savedChartModel,
            });

            await expect(
                service.getEmbedDataAppVizRenderMetadata(
                    makeAccount({ type }),
                    PROJECT_UUID,
                    SAVED_CHART_UUID,
                    DATA_APP_VIZ_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(savedChartModel.get).not.toHaveBeenCalled();
        },
    );

    it('mints a token only for the exact requested renderable version', async () => {
        const appModel = {
            findVisualizationApp: vi
                .fn()
                .mockResolvedValue(makeDataAppVizRow()),
            getVersion: vi.fn().mockResolvedValue(makeVersion({ version: 2 })),
            getLatestRenderableDataAppVizVersion: vi
                .fn()
                .mockResolvedValue(makeVersion({ version: 2 })),
        };
        const service = buildService({
            appModel,
            savedChartModel: {
                get: vi.fn().mockResolvedValue(makeSavedChart()),
            },
        });

        const token = await service.getEmbedDataAppVizPreviewToken(
            chartAccount(),
            PROJECT_UUID,
            SAVED_CHART_UUID,
            DATA_APP_VIZ_UUID,
            2,
        );

        expect(appModel.getVersion).toHaveBeenCalledWith(DATA_APP_VIZ_UUID, 2);
        expect(
            verifyPreviewToken(
                token,
                testLightdashSecrets,
                DATA_APP_VIZ_UUID,
                2,
            ),
        ).toMatchObject({
            ok: true,
            payload: {
                userUuid: 'embed-user-1',
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
            },
        });
    });
});
