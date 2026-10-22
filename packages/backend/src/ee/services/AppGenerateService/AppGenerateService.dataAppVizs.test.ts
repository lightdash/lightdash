// Stub the e2b/ai SDKs so the tests never reach a real sandbox or model client.
import {
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { verifyPreviewToken } from '../../../routers/appPreviewToken';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { AppGenerateService } from './AppGenerateService';
import { featureFlagModelWith } from './AppGenerateService.mock';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const USER = { userUuid: 'user-1' } as never;

const vizSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

const makeDataAppVizRow = (overrides: Record<string, unknown> = {}) => ({
    app_id: 'data-app-viz-1',
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: 'A radial gauge renderer',
    project_uuid: 'project-1',
    space_uuid: null,
    sandbox_id: null,
    template: DATA_APP_VIZ_TEMPLATE,
    icon: null,
    viz_schema: vizSchema,
    viz_preview: null,
    design_uuid: null,
    upstream_app_uuid: null,
    created_at: new Date('2026-06-30'),
    created_by_user_uuid: 'user-1',
    deleted_at: null,
    deleted_by_user_uuid: null,
    views_count: 0,
    search_vector: '',
    organization_uuid: 'org-1',
    ...overrides,
});

const testLightdashSecrets = {
    active: 'test-secret',
    fallbacks: [],
    all: ['test-secret'],
};

function buildService(
    appModel: unknown,
    overrides: {
        savedChartModel?: unknown;
        savedChartService?: unknown;
        documentService?: unknown;
        featureFlags?: Record<string, boolean>;
        chartStudioAvailable?: boolean;
    } = {},
) {
    const service = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: {
            lightdashSecret: 'test-secret',
            lightdashSecrets: testLightdashSecrets,
            // No app-runtime storage configured, so the bundle-existence
            // check fails open and metadata comes from the DB alone.
            appRuntime: { s3: null },
        } as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModelWith(overrides.featureFlags) as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-1' }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: (overrides.savedChartModel ?? {}) as never,
        schedulerClient: {} as never,
        savedChartService: (overrides.savedChartService ?? {}) as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                inheritsFromOrgOrProject: false,
                access: [],
            }),
        } as never,
        coderService: {} as never,
        documentService: (overrides.documentService ?? {}) as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            getBrowserImageOrigins: vi.fn().mockResolvedValue([]),
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock({
            appModel: appModel as never,
        }),
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
    });
    // The runtime config predicate has its own tests; stub its answer here.
    vi.spyOn(service, 'isChartStudioAvailable').mockReturnValue(
        overrides.chartStudioAvailable ?? true,
    );
    // Bypass real CASL — the mapping/flow is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({
        can: () => true,
        cannot: () => false,
    });
    return service;
}

/**
 * A service whose ability is the real thing, so the rules under test are the
 * ones that ship.
 */
function buildServiceWithRealAbility(
    appModel: unknown,
    role: OrganizationMemberRole,
    userUuid: string,
    overrides: { savedChartModel?: unknown; savedChartService?: unknown } = {},
) {
    const service = buildService(appModel, overrides);
    const { builder } = getUserAbilityBuilder({
        user: {
            role,
            organizationUuid: 'org-1',
            userUuid,
            roleUuid: undefined,
        },
        projectProfiles: [],
        permissionsConfig: { pat: { enabled: false, allowedOrgRoles: [] } },
    });
    // Drop buildService's allow-everything stub so the real rules apply.
    delete (service as unknown as { createAuditedAbility?: unknown })
        .createAuditedAbility;
    return {
        service,
        user: {
            userUuid,
            organizationUuid: 'org-1',
            ability: builder.build(),
        } as never,
    };
}

function buildServiceWithCustomSavedChartRole(
    appModel: unknown,
    userUuid: string,
    overrides: { savedChartModel?: unknown; savedChartService?: unknown } = {},
) {
    const service = buildService(appModel, overrides);
    const customRoleUuid = 'custom-saved-chart-viewer';
    const { builder } = getUserAbilityBuilder({
        user: {
            role: OrganizationMemberRole.MEMBER,
            organizationUuid: 'org-1',
            userUuid,
            roleUuid: customRoleUuid,
        },
        projectProfiles: [],
        permissionsConfig: { pat: { enabled: false, allowedOrgRoles: [] } },
        customRoleScopes: { [customRoleUuid]: ['view:SavedChart'] },
        customRolesEnabled: true,
    });
    delete (service as unknown as { createAuditedAbility?: unknown })
        .createAuditedAbility;
    return {
        service,
        user: {
            userUuid,
            organizationUuid: 'org-1',
            ability: builder.build(),
        } as never,
    };
}

describe('AppGenerateService data app vizs', () => {
    it('maps a page of rows to by-reference DataAppVizs (no code copied)', async () => {
        const pagination = {
            page: 1,
            pageSize: 25,
            totalPageCount: 1,
            totalResults: 1,
        };
        const appModel = {
            listDataAppVisualizations: vi
                .fn()
                .mockResolvedValue({ data: [makeDataAppVizRow()], pagination }),
        };
        const service = buildService(appModel);

        const result = await service.listDataAppVisualizations(
            USER,
            'project-1',
            { page: 1, pageSize: 25 },
        );

        expect(appModel.listDataAppVisualizations).toHaveBeenCalledWith(
            'project-1',
            { page: 1, pageSize: 25 },
            undefined,
            { sortBy: 'createdAt', sortDirection: 'desc' },
        );
        expect(result).toEqual({
            data: [
                {
                    dataAppVizUuid: 'data-app-viz-1',
                    slug: 'radial-gauge',
                    name: 'Radial gauge',
                    description: 'A radial gauge renderer',
                    projectUuid: 'project-1',
                    spaceUuid: null,
                    schema: vizSchema,
                    createdAt: new Date('2026-06-30'),
                    createdByUserUuid: 'user-1',
                    icon: null,
                },
            ],
            pagination,
        });
    });

    it('passes a name sort through to the model', async () => {
        const pagination = {
            page: 1,
            pageSize: 25,
            totalPageCount: 1,
            totalResults: 1,
        };
        const appModel = {
            listDataAppVisualizations: vi
                .fn()
                .mockResolvedValue({ data: [makeDataAppVizRow()], pagination }),
        };
        const service = buildService(appModel);

        await service.listDataAppVisualizations(
            USER,
            'project-1',
            { page: 1, pageSize: 25 },
            undefined,
            { sortBy: 'name', sortDirection: 'asc' },
        );

        expect(appModel.listDataAppVisualizations).toHaveBeenCalledWith(
            'project-1',
            { page: 1, pageSize: 25 },
            undefined,
            { sortBy: 'name', sortDirection: 'asc' },
        );
    });

    describe('who the library is offered to', () => {
        const listPagination = {
            page: 1,
            pageSize: 25,
            totalPageCount: 1,
            totalResults: 3,
        };
        const rows = [
            makeDataAppVizRow({
                app_id: 'mine-unfiled',
                space_uuid: null,
                created_by_user_uuid: 'editor-1',
            }),
            makeDataAppVizRow({
                app_id: 'someone-elses-unfiled',
                space_uuid: null,
                created_by_user_uuid: 'someone-else',
            }),
            makeDataAppVizRow({
                app_id: 'in-someone-elses-space',
                space_uuid: 'space-1',
                created_by_user_uuid: 'someone-else',
            }),
        ];
        const wholeLibrary = rows.map((row) => row.app_id);
        const listed = async (role: OrganizationMemberRole) => {
            const appModel = {
                listDataAppVisualizations: vi.fn().mockResolvedValue({
                    data: rows,
                    pagination: listPagination,
                }),
            };
            const { service, user } = buildServiceWithRealAbility(
                appModel,
                role,
                'editor-1',
            );
            const result = await service.listDataAppVisualizations(
                user,
                'project-1',
                { page: 1, pageSize: 25 },
            );
            return result.data.map((viz) => viz.dataAppVizUuid);
        };

        // The library follows the explore: whoever can build a chart is offered
        // every renderer in the project, whether or not they authored it.
        it.each([
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.DEVELOPER,
            OrganizationMemberRole.ADMIN,
        ])('offers the whole project library to a %s', async (role) => {
            expect(await listed(role)).toEqual(wholeLibrary);
        });

        it('refuses a viewer, who has no explore to render one in', async () => {
            await expect(listed(OrganizationMemberRole.VIEWER)).rejects.toThrow(
                ForbiddenError,
            );
        });
    });

    describe('who can read a chart type schema', () => {
        // Registry installs are space-less and authored by the installer, so
        // the schema read must follow the listing's manage:Explore gate —
        // a view:DataApp check would deny everyone but installer and admins.
        const someoneElsesViz = makeDataAppVizRow({
            space_uuid: null,
            created_by_user_uuid: 'someone-else',
        });
        const readSchema = async (role: OrganizationMemberRole) => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(someoneElsesViz),
            };
            const { service, user } = buildServiceWithRealAbility(
                appModel,
                role,
                'editor-1',
            );
            return service.getDataAppVisualization(
                user,
                'project-1',
                'data-app-viz-1',
            );
        };

        it.each([
            OrganizationMemberRole.INTERACTIVE_VIEWER,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.DEVELOPER,
            OrganizationMemberRole.ADMIN,
        ])('lets a %s read a schema they did not author', async (role) => {
            const result = await readSchema(role);
            expect(result.dataAppVizUuid).toBe('data-app-viz-1');
        });

        it('refuses a viewer the schema', async () => {
            await expect(
                readSchema(OrganizationMemberRole.VIEWER),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('who can see a chart type thumbnail', () => {
        const chartTypeApp = {
            app_id: 'data-app-viz-1',
            project_uuid: 'project-1',
            organization_uuid: 'org-1',
            space_uuid: null,
            created_by_user_uuid: 'someone-else',
            template: DATA_APP_VIZ_TEMPLATE,
        };
        const getThumbnail = async (role: OrganizationMemberRole) => {
            const appModel = {
                getApp: vi.fn().mockResolvedValue(chartTypeApp),
            };
            const { service, user } = buildServiceWithRealAbility(
                appModel,
                role,
                'editor-1',
            );
            return service.getThumbnailUrl(user, 'project-1', 'data-app-viz-1');
        };

        it('gates a chart type thumbnail on the explore, not app view', async () => {
            // Passing the ability gate reaches the lookup, which finds no
            // stored image instead of a ForbiddenError.
            await expect(
                getThumbnail(OrganizationMemberRole.EDITOR),
            ).rejects.toThrow(NotFoundError);
        });

        it('refuses a viewer the thumbnail', async () => {
            await expect(
                getThumbnail(OrganizationMemberRole.VIEWER),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('the chart type usage flag gate', () => {
        it.each([
            [true, false, false],
            [false, false, false],
        ])(
            'lists with Chart Studio=%s, library=%s, data apps=%s',
            async (chartStudio, library, dataApps) => {
                const list = vi
                    .fn()
                    .mockResolvedValue({ data: [], pagination: undefined });
                const service = buildService(
                    { listDataAppVisualizations: list },
                    {
                        chartStudioAvailable: chartStudio,
                        featureFlags: {
                            [FeatureFlags.EnableDataApps]: dataApps,
                            [FeatureFlags.ChartTypeRegistry]: library,
                        },
                    },
                );
                const getFeatureFlag = vi.spyOn(
                    service['featureFlagModel'],
                    'get',
                );
                const result = service.listDataAppVisualizations(
                    USER,
                    'project-1',
                );
                if (chartStudio || library || dataApps) {
                    await expect(result).resolves.toMatchObject({ data: [] });
                    expect(list).toHaveBeenCalled();
                } else {
                    await expect(result).rejects.toThrow(
                        'Chart types are not enabled',
                    );
                    expect(list).not.toHaveBeenCalled();
                }
                if (chartStudio) {
                    expect(getFeatureFlag).not.toHaveBeenCalled();
                }
            },
        );

        // Usage follows either flag: the library flag alone is enough to
        // pick, configure, and render installed chart types.
        const libraryOnly = {
            [FeatureFlags.EnableDataApps]: false,
            [FeatureFlags.ChartTypeRegistry]: true,
        };
        const bothOff = {
            [FeatureFlags.EnableDataApps]: false,
            [FeatureFlags.ChartTypeRegistry]: false,
        };

        it('lists the picker with data apps off when the library is on', async () => {
            const appModel = {
                listDataAppVisualizations: vi.fn().mockResolvedValue({
                    data: [makeDataAppVizRow()],
                    pagination: undefined,
                }),
            };
            const service = buildService(appModel, {
                chartStudioAvailable: false,
                featureFlags: libraryOnly,
            });

            await expect(
                service.listDataAppVisualizations(USER, 'project-1'),
            ).resolves.toBeDefined();
        });

        it('reads a schema with data apps off when the library is on', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            };
            const service = buildService(appModel, {
                chartStudioAvailable: false,
                featureFlags: libraryOnly,
            });

            const result = await service.getDataAppVisualization(
                USER,
                'project-1',
                'data-app-viz-1',
            );

            expect(result.dataAppVizUuid).toBe('data-app-viz-1');
        });

        it('refuses usage when both flags are off', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            };
            const service = buildService(appModel, {
                chartStudioAvailable: false,
                featureFlags: bothOff,
            });

            await expect(
                service.getDataAppVisualization(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    it('forwards the search term to the model', async () => {
        const pagination = {
            page: 1,
            pageSize: 25,
            totalPageCount: 1,
            totalResults: 1,
        };
        const appModel = {
            listDataAppVisualizations: vi
                .fn()
                .mockResolvedValue({ data: [makeDataAppVizRow()], pagination }),
        };
        const service = buildService(appModel);

        await service.listDataAppVisualizations(
            USER,
            'project-1',
            { page: 1, pageSize: 25 },
            'gauge',
        );

        expect(appModel.listDataAppVisualizations).toHaveBeenCalledWith(
            'project-1',
            { page: 1, pageSize: 25 },
            'gauge',
            { sortBy: 'createdAt', sortDirection: 'desc' },
        );
    });

    it('404s getDataAppVisualization for an id that is not a data app viz', async () => {
        const appModel = {
            findVisualizationApp: vi.fn().mockResolvedValue(undefined),
        };
        const service = buildService(appModel);

        await expect(
            service.getDataAppVisualization(
                USER,
                'project-1',
                'not-a-data-app-viz',
            ),
        ).rejects.toThrow(NotFoundError);
    });

    describe('reading a schema at a version', () => {
        // The options a version declares live on that version's row, so an
        // older one describes a different chart than the latest ready.
        const olderSchema: DataAppVizSchema = {
            fields: [
                {
                    name: 'category',
                    label: 'Category',
                    type: 'dimension',
                    required: true,
                },
            ],
            configOptions: [
                {
                    name: 'showLegend',
                    label: 'Show legend',
                    type: 'boolean',
                    default: true,
                },
            ],
            colorPalette: null,
        };

        const olderVersionRow = (overrides: Record<string, unknown> = {}) => ({
            app_version_id: 'app-version-2',
            app_id: 'data-app-viz-1',
            version: 2,
            prompt: 'add a legend toggle',
            status: 'ready',
            error: null,
            status_message: null,
            status_history: [],
            status_updated_at: new Date('2026-06-30'),
            resources: null,
            dependencies: null,
            viz_schema: olderSchema,
            viz_preview: null,
            generation_usage: null,
            created_at: new Date('2026-06-30'),
            created_by_user_uuid: 'user-1',
            ...overrides,
        });

        it('answers with the asked-for version schema, not the latest ready one', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn().mockResolvedValue(olderVersionRow()),
            };
            const service = buildService(appModel);

            const result = await service.getDataAppVisualization(
                USER,
                'project-1',
                'data-app-viz-1',
                2,
            );

            expect(appModel.getVersion).toHaveBeenCalledWith(
                'data-app-viz-1',
                2,
            );
            expect(result.schema).toEqual(olderSchema);
        });

        it('answers with the latest ready schema when no version is asked for', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn(),
            };
            const service = buildService(appModel);

            const result = await service.getDataAppVisualization(
                USER,
                'project-1',
                'data-app-viz-1',
            );

            expect(appModel.getVersion).not.toHaveBeenCalled();
            expect(result.schema).toEqual(vizSchema);
        });

        it('404s a version that never became renderable', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(
                        olderVersionRow({ status: 'error', viz_schema: null }),
                    ),
            };
            const service = buildService(appModel);

            await expect(
                service.getDataAppVisualization(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                    2,
                ),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('viz-only render metadata', () => {
        const makeVersion = (overrides: Record<string, unknown> = {}) => ({
            app_version_id: 'app-version-1',
            app_id: 'data-app-viz-1',
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
            viz_preview: null,
            generation_usage: null,
            created_at: new Date('2026-06-30'),
            created_by_user_uuid: 'user-1',
            ...overrides,
        });

        const chartDeps = (
            dataAppVizUuid: string | undefined = 'data-app-viz-1',
            hasAccess = vi.fn().mockResolvedValue([]),
        ) => ({
            savedChartService: { hasAccess },
            savedChartModel: {
                get: vi.fn().mockResolvedValue({
                    uuid: 'chart-1',
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: { dataAppVizUuid },
                    },
                }),
            },
        });

        describe('rendering a Document chart', () => {
            const ACCOUNT = {
                user: { userUuid: 'reader-1' },
                organization: { organizationUuid: 'org-1' },
            } as never;
            const reference = {
                documentUuid: 'document-1',
                versionUuid: 'document-version-3',
                chartId: 'c2',
            };
            const documentDeps = (
                chartConfig: unknown = {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: 'data-app-viz-1',
                        dataAppVizSlug: 'radial-gauge',
                        dataAppVizVersion: 2,
                        fieldMapping: {},
                    },
                },
                getChart = vi.fn().mockResolvedValue({
                    source: 'semantic',
                    chart: { chartConfig },
                }),
            ) => ({ documentService: { getChart }, getChart });
            const pinnedAppModel = () => ({
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
                getLatestVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 4 })),
            });

            it('mints a reader token for the version the Document chart pins', async () => {
                const appModel = pinnedAppModel();
                const { getChart, ...deps } = documentDeps();
                const service = buildService(appModel, deps);

                const token = await service.getDocumentDataAppVizPreviewToken(
                    ACCOUNT,
                    'project-1',
                    reference,
                    'data-app-viz-1',
                    2,
                );

                expect(getChart).toHaveBeenCalledWith(
                    ACCOUNT,
                    'project-1',
                    reference,
                );
                expect(
                    verifyPreviewToken(
                        token,
                        testLightdashSecrets,
                        'data-app-viz-1',
                        2,
                    ),
                ).toMatchObject({
                    ok: true,
                    payload: {
                        appUuid: 'data-app-viz-1',
                        version: 2,
                        userUuid: 'reader-1',
                        viewContext: 'chart',
                        organizationUuid: 'org-1',
                        projectUuid: 'project-1',
                    },
                });
            });

            it('renders the version the Document chart pins', async () => {
                const appModel = pinnedAppModel();
                const service = buildService(appModel, documentDeps());

                await expect(
                    service.getDocumentDataAppVizRenderMetadata(
                        ACCOUNT,
                        'project-1',
                        reference,
                        'data-app-viz-1',
                    ),
                ).resolves.toMatchObject({ state: 'ready', version: 2 });
                expect(appModel.getLatestVersion).not.toHaveBeenCalled();
            });

            it('propagates the Document denial and mints no token', async () => {
                const appModel = pinnedAppModel();
                const service = buildService(
                    appModel,
                    documentDeps(
                        undefined,
                        vi
                            .fn()
                            .mockRejectedValue(
                                new NotFoundError('Document not found'),
                            ),
                    ),
                );

                await expect(
                    service.getDocumentDataAppVizPreviewToken(
                        ACCOUNT,
                        'project-1',
                        reference,
                        'data-app-viz-1',
                        2,
                    ),
                ).rejects.toThrow(NotFoundError);
                expect(appModel.getVersion).not.toHaveBeenCalled();
            });

            it.each([
                ['another viz', 'another-viz'],
                ['a built-in chart', undefined],
            ])(
                'rejects a chart that renders %s',
                async (_case, dataAppVizUuid) => {
                    const appModel = pinnedAppModel();
                    const service = buildService(
                        appModel,
                        documentDeps(
                            dataAppVizUuid
                                ? {
                                      type: ChartType.DATA_APP_VIZ,
                                      config: {
                                          dataAppVizUuid,
                                          fieldMapping: {},
                                      },
                                  }
                                : { type: ChartType.TABLE },
                        ),
                    );

                    await expect(
                        service.getDocumentDataAppVizPreviewToken(
                            ACCOUNT,
                            'project-1',
                            reference,
                            'data-app-viz-1',
                            2,
                        ),
                    ).rejects.toThrow(
                        'Not authorized to access this visualization',
                    );
                    expect(appModel.getVersion).not.toHaveBeenCalled();
                },
            );

            it('rejects a token for a version other than the chart pin', async () => {
                const appModel = pinnedAppModel();
                const service = buildService(appModel, documentDeps());

                await expect(
                    service.getDocumentDataAppVizPreviewToken(
                        ACCOUNT,
                        'project-1',
                        reference,
                        'data-app-viz-1',
                        4,
                    ),
                ).rejects.toThrow(ForbiddenError);
                expect(appModel.getVersion).not.toHaveBeenCalled();
            });

            it('stays off when chart types are disabled', async () => {
                const appModel = pinnedAppModel();
                const { getChart, ...deps } = documentDeps();
                const service = buildService(appModel, {
                    ...deps,
                    chartStudioAvailable: false,
                    featureFlags: {
                        [FeatureFlags.EnableDataApps]: false,
                        [FeatureFlags.ChartTypeRegistry]: false,
                    },
                });

                await expect(
                    service.getDocumentDataAppVizPreviewToken(
                        ACCOUNT,
                        'project-1',
                        reference,
                        'data-app-viz-1',
                        2,
                    ),
                ).rejects.toThrow();
                expect(getChart).not.toHaveBeenCalled();
            });
        });

        it('lets an interactive viewer preview a viz while authoring', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getLatestVersion: vi.fn().mockResolvedValue(makeVersion()),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion()),
            };
            const { service, user } = buildServiceWithRealAbility(
                appModel,
                OrganizationMemberRole.INTERACTIVE_VIEWER,
                'interactive-1',
            );

            await expect(
                service.getDataAppVizRenderMetadata(
                    user,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).resolves.toMatchObject({ state: 'ready', version: 1 });
        });

        it('renders an immutable chart-less artifact on its explicit version', async () => {
            const versionTwoSchema = {
                ...vizSchema,
                fields: [
                    ...vizSchema.fields,
                    {
                        name: 'series',
                        label: 'Series',
                        type: 'series' as const,
                        required: false,
                    },
                ],
            };
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn().mockResolvedValue(
                    makeVersion({
                        version: 2,
                        viz_schema: versionTwoSchema,
                    }),
                ),
                getLatestVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 3 })),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 3 })),
            };
            const service = buildService(appModel);

            await expect(
                service.getDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                    2,
                ),
            ).resolves.toEqual({
                state: 'ready',
                version: 2,
                preview: null,
                schema: versionTwoSchema,
                latestBuildInProgress: false,
            });
            expect(appModel.getVersion).toHaveBeenCalledWith(
                'data-app-viz-1',
                2,
            );
            expect(appModel.getLatestVersion).not.toHaveBeenCalled();
        });

        it('forbids a plain viewer from the chart-less authoring preview', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn(),
            };
            const { service, user } = buildServiceWithRealAbility(
                appModel,
                OrganizationMemberRole.VIEWER,
                'viewer-1',
            );

            await expect(
                service.getDataAppVizRenderMetadata(
                    user,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getDataAppVizPreviewToken(
                    user,
                    'project-1',
                    'data-app-viz-1',
                    1,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(appModel.getVersion).not.toHaveBeenCalled();
        });

        it('forbids a view:SavedChart-only custom role from the authoring preview', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn(),
            };
            const { service, user } = buildServiceWithCustomSavedChartRole(
                appModel,
                'custom-viewer-1',
            );

            await expect(
                service.getDataAppVizPreviewToken(
                    user,
                    'project-1',
                    'data-app-viz-1',
                    1,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(appModel.getVersion).not.toHaveBeenCalled();
        });

        it('authorizes the saved chart when rendering it, ignoring the viz row space', async () => {
            const appModel = {
                findVisualizationApp: vi.fn().mockResolvedValue(
                    makeDataAppVizRow({
                        created_by_user_uuid: 'author-1',
                        space_uuid: 'private-space-1',
                    }),
                ),
                getLatestVersion: vi.fn().mockResolvedValue(makeVersion()),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion()),
            };
            const hasAccess = vi.fn().mockResolvedValue([]);
            const service = buildService(
                appModel,
                chartDeps('data-app-viz-1', hasAccess),
            );

            await expect(
                service.getChartDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
                ),
            ).resolves.toMatchObject({ state: 'ready', version: 1 });
            expect(hasAccess).toHaveBeenCalledWith(
                'view',
                { user: USER, projectUuid: 'project-1' },
                { savedChartUuid: 'chart-1' },
            );
        });

        it('renders the project chart type version pinned by the saved chart', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
                getLatestVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 4 })),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 4 })),
            };
            const service = buildService(appModel, {
                savedChartService: { hasAccess: vi.fn().mockResolvedValue([]) },
                savedChartModel: {
                    get: vi.fn().mockResolvedValue({
                        uuid: 'chart-1',
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                dataAppVizUuid: 'data-app-viz-1',
                                dataAppVizVersion: 2,
                            },
                        },
                    }),
                },
            });

            await expect(
                service.getChartDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
                ),
            ).resolves.toMatchObject({ state: 'ready', version: 2 });
            expect(appModel.getVersion).toHaveBeenCalledWith(
                'data-app-viz-1',
                2,
            );
            expect(appModel.getLatestVersion).not.toHaveBeenCalled();
        });

        it('rejects a preview token for a version other than the saved chart pin', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 4 })),
            };
            const service = buildService(appModel, {
                savedChartService: { hasAccess: vi.fn().mockResolvedValue([]) },
                savedChartModel: {
                    get: vi.fn().mockResolvedValue({
                        uuid: 'chart-1',
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                dataAppVizUuid: 'data-app-viz-1',
                                dataAppVizVersion: 2,
                            },
                        },
                    }),
                },
            });

            await expect(
                service.getChartDataAppVizPreviewToken(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
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
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
            };
            const service = buildService(appModel, chartDeps('data-app-viz-1'));

            await expect(
                service.getChartDataAppVizPreviewToken(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
                    2,
                ),
            ).rejects.toThrow(ForbiddenError);
        });

        it('propagates the chart denial and mints no token', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn(),
            };
            const hasAccess = vi
                .fn()
                .mockRejectedValue(new ForbiddenError('no chart access'));
            const service = buildService(
                appModel,
                chartDeps('data-app-viz-1', hasAccess),
            );

            await expect(
                service.getChartDataAppVizPreviewToken(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
                    1,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(appModel.getVersion).not.toHaveBeenCalled();
        });

        it('authorizes against the requested chart version, not the latest', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
            };
            const get = vi.fn().mockResolvedValue({
                uuid: 'chart-1',
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: 'data-app-viz-1',
                        dataAppVizVersion: 2,
                    },
                },
            });
            const service = buildService(appModel, {
                savedChartService: { hasAccess: vi.fn().mockResolvedValue([]) },
                savedChartModel: { get },
            });

            await expect(
                service.getChartDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
                    'chart-version-7',
                ),
            ).resolves.toMatchObject({ state: 'ready', version: 2 });
            expect(get).toHaveBeenCalledWith('chart-1', 'chart-version-7', {
                projectUuid: 'project-1',
            });
            expect(appModel.getVersion).toHaveBeenCalledWith(
                'data-app-viz-1',
                2,
            );
        });

        it('rejects a chart that does not reference the requested viz', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn(),
            };
            const service = buildService(appModel, chartDeps('another-viz'));

            await expect(
                service.getChartDataAppVizPreviewToken(
                    USER,
                    'project-1',
                    'chart-1',
                    'data-app-viz-1',
                    1,
                ),
            ).rejects.toThrow('Not authorized to access this visualization');
            expect(appModel.getVersion).not.toHaveBeenCalled();
        });

        it('resolves the template-filtered viz before checking the feature flag', async () => {
            const appModel = {
                findVisualizationApp: vi.fn().mockResolvedValue(undefined),
            };
            const service = buildService(appModel);
            const getFeatureFlag = vi.spyOn(service['featureFlagModel'], 'get');

            await expect(
                service.getDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'non-visualization-data-app',
                ),
            ).rejects.toMatchObject({
                message: 'Data app visualization not found',
            });

            expect(getFeatureFlag).not.toHaveBeenCalled();
        });

        it('resolves the template-filtered viz before validating a token version', async () => {
            const appModel = {
                findVisualizationApp: vi.fn().mockResolvedValue(undefined),
            };
            const service = buildService(appModel);
            const getFeatureFlag = vi.spyOn(service['featureFlagModel'], 'get');

            await expect(
                service.getDataAppVizPreviewToken(
                    USER,
                    'project-1',
                    'non-visualization-data-app',
                    0,
                ),
            ).rejects.toThrow(NotFoundError);

            expect(getFeatureFlag).not.toHaveBeenCalled();
        });

        it('rejects a real viz when chart types are disabled', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            };
            const service = buildService(appModel, {
                chartStudioAvailable: false,
                featureFlags: {
                    [FeatureFlags.EnableDataApps]: false,
                    [FeatureFlags.ChartTypeRegistry]: false,
                },
            });

            await expect(
                service.getDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).rejects.toThrow(ForbiddenError);
        });

        it('serves the last renderable version while the latest build is in progress', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getLatestVersion: vi
                    .fn()
                    .mockResolvedValue(
                        makeVersion({ version: 3, status: 'building' }),
                    ),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
            };
            const service = buildService(appModel);

            await expect(
                service.getDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).resolves.toEqual({
                state: 'ready',
                version: 2,
                schema: vizSchema,
                preview: null,
                latestBuildInProgress: true,
            });
        });

        it('returns building when no renderable version exists and the latest build is in progress', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getLatestVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ status: 'generating' })),
                getLatestRenderableDataAppVizVersion: vi
                    .fn()
                    .mockResolvedValue(null),
            };
            const service = buildService(appModel);

            await expect(
                service.getDataAppVizRenderMetadata(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).resolves.toEqual({
                state: 'building',
                latestBuildInProgress: true,
            });
        });

        it.each([
            makeVersion({ status: 'error', viz_schema: null }),
            makeVersion({ status: 'ready', viz_schema: null }),
            null,
        ])(
            'returns failed when no renderable version or active build exists',
            async (latestVersion) => {
                const appModel = {
                    findVisualizationApp: vi
                        .fn()
                        .mockResolvedValue(makeDataAppVizRow()),
                    getLatestVersion: vi.fn().mockResolvedValue(latestVersion),
                    getLatestRenderableDataAppVizVersion: vi
                        .fn()
                        .mockResolvedValue(null),
                };
                const service = buildService(appModel);

                await expect(
                    service.getDataAppVizRenderMetadata(
                        USER,
                        'project-1',
                        'data-app-viz-1',
                    ),
                ).resolves.toEqual({
                    state: 'failed',
                    latestBuildInProgress: false,
                });
            },
        );

        it('mints a token for the exact requested renderable version', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
            };
            const service = buildService(appModel);

            const token = await service.getDataAppVizPreviewToken(
                USER,
                'project-1',
                'data-app-viz-1',
                2,
            );

            expect(appModel.getVersion).toHaveBeenCalledWith(
                'data-app-viz-1',
                2,
            );
            expect(
                verifyPreviewToken(
                    token,
                    testLightdashSecrets,
                    'data-app-viz-1',
                    2,
                ),
            ).toMatchObject({
                ok: true,
                payload: {
                    appUuid: 'data-app-viz-1',
                    version: 2,
                    viewContext: 'chart',
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                },
            });
        });

        it('mints an MCP-tagged token for a renderable version', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi
                    .fn()
                    .mockResolvedValue(makeVersion({ version: 2 })),
            };
            const service = buildService(appModel);

            const token = await service.getDataAppVizPreviewToken(
                USER,
                'project-1',
                'data-app-viz-1',
                2,
                'mcp',
            );

            expect(
                verifyPreviewToken(
                    token,
                    testLightdashSecrets,
                    'data-app-viz-1',
                    2,
                ),
            ).toMatchObject({
                ok: true,
                payload: { version: 2, viewContext: 'mcp' },
            });
        });

        it('refuses the MCP token without manage:Explore', async () => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn(),
            };
            const { service, user } = buildServiceWithRealAbility(
                appModel,
                OrganizationMemberRole.VIEWER,
                'viewer-1',
            );

            await expect(
                service.getDataAppVizPreviewToken(
                    user,
                    'project-1',
                    'data-app-viz-1',
                    1,
                    'mcp',
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(appModel.getVersion).not.toHaveBeenCalled();
        });

        it.each([
            null,
            makeVersion({ status: 'building' }),
            makeVersion({ viz_schema: null }),
        ])('rejects a non-renderable requested version', async (appVersion) => {
            const appModel = {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
                getVersion: vi.fn().mockResolvedValue(appVersion),
            };
            const service = buildService(appModel);

            await expect(
                service.getDataAppVizPreviewToken(
                    USER,
                    'project-1',
                    'data-app-viz-1',
                    2,
                ),
            ).rejects.toMatchObject({
                message: 'Renderable data app visualization version not found',
            });
        });
    });

    it('surfaces viz_schema per version as resources.vizSchema', async () => {
        const makeVersion = (overrides: Record<string, unknown> = {}) => ({
            app_version_id: 'app-version-1',
            app_id: 'app-1',
            prompt: 'build a chart',
            status: 'ready',
            error: null,
            status_message: 'Visualization ready',
            status_updated_at: new Date('2026-06-30'),
            resources: null,
            viz_schema: null,
            created_at: new Date('2026-06-30'),
            created_by_user_uuid: 'user-1',
            created_by_user_first_name: 'A',
            created_by_user_last_name: 'B',
            app_thread_uuid: 'thread-1',
            thread_number: 1,
            ...overrides,
        });
        const appModel = {
            getAppByUuidOrSlug: vi.fn().mockResolvedValue({ app_id: 'app-1' }),
            getAppWithVersions: vi.fn().mockResolvedValue({
                name: 'a',
                description: '',
                createdByUserUuid: 'user-1',
                organizationUuid: 'org-1',
                spaceUuid: null,
                spaceName: null,
                template: DATA_APP_VIZ_TEMPLATE,
                pinnedListUuid: null,
                pinnedListOrder: null,
                currentThread: {
                    app_thread_uuid: 'thread-1',
                    thread_number: 1,
                    created_at: new Date('2026-06-30'),
                },
                hasMore: false,
                versions: [
                    makeVersion({ version: 2, viz_schema: vizSchema }),
                    makeVersion({ version: 1, viz_schema: null }),
                ],
            }),
            getLatestReadyVersion: vi.fn().mockResolvedValue({ version: 2 }),
        };
        const service = buildService(appModel);

        const res = await service.getAppVersions(
            USER,
            'project-1',
            'app-1',
            {},
        );

        expect(res.versions[0].resources?.vizSchema).toEqual(vizSchema);
        expect(res.versions[1].resources?.vizSchema ?? null).toBeNull();
    });
});

describe('moving a viz into a space', () => {
    it('rejects moveToSpace for viz-template apps before any access checks, even with data apps off', async () => {
        const appModel = {
            getApp: vi.fn().mockResolvedValue(makeDataAppVizRow()),
            moveToSpace: vi.fn(),
        };
        const service = buildService(appModel, {
            featureFlags: { [FeatureFlags.EnableDataApps]: false },
        });

        await expect(
            service.moveToSpace(USER, {
                projectUuid: 'project-1',
                itemUuid: 'data-app-viz-1',
                targetSpaceUuid: 'space-1',
            }),
        ).rejects.toThrow('Custom chart types cannot be moved into spaces');
        expect(appModel.moveToSpace).not.toHaveBeenCalled();
    });

    it('still moves standalone apps', async () => {
        const appModel = {
            getApp: vi.fn().mockResolvedValue(
                makeDataAppVizRow({
                    template: null,
                    space_uuid: 'space-0',
                }),
            ),
            moveToSpace: vi.fn().mockResolvedValue(undefined),
        };
        const service = buildService(appModel);

        await service.moveToSpace(
            USER,
            {
                projectUuid: 'project-1',
                itemUuid: 'data-app-viz-1',
                targetSpaceUuid: 'space-1',
            },
            { trackEvent: false },
        );
        expect(appModel.moveToSpace).toHaveBeenCalledWith(
            {
                appId: 'data-app-viz-1',
                projectUuid: 'project-1',
                targetSpaceUuid: 'space-1',
            },
            { tx: undefined },
        );
    });
});

describe('choosing a chart type icon', () => {
    const buildIconService = (app: Record<string, unknown>) => {
        const appModel = {
            getApp: vi.fn().mockResolvedValue(app),
            updateApp: vi
                .fn()
                .mockImplementation(async (_appId, _projectUuid, update) => ({
                    ...app,
                    ...update,
                })),
        };
        return { service: buildService(appModel), appModel };
    };

    it('rejects an icon on an app that is not a chart type', async () => {
        const { service, appModel } = buildIconService(
            makeDataAppVizRow({ template: null, registry_slug: null }),
        );

        await expect(
            service.updateApp(USER, 'project-1', 'data-app-viz-1', {
                icon: 'chart-pie',
            }),
        ).rejects.toThrow('Only custom chart types can have an icon');
        expect(appModel.updateApp).not.toHaveBeenCalled();
    });

    it('rejects an icon that is not in the curated set', async () => {
        const { service, appModel } = buildIconService(
            makeDataAppVizRow({ registry_slug: null }),
        );

        await expect(
            service.updateApp(USER, 'project-1', 'data-app-viz-1', {
                icon: 'skull' as never,
            }),
        ).rejects.toThrow(ParameterError);
        expect(appModel.updateApp).not.toHaveBeenCalled();
    });

    it('rejects an unknown auto analysis value', async () => {
        const { service, appModel } = buildIconService(
            makeDataAppVizRow({ template: null, registry_slug: null }),
        );

        await expect(
            service.updateApp(USER, 'project-1', 'data-app-viz-1', {
                autoAnalysis: 'always' as never,
            }),
        ).rejects.toThrow(ParameterError);
        expect(appModel.updateApp).not.toHaveBeenCalled();
    });

    it('stores the auto analysis choice on any app', async () => {
        const { service, appModel } = buildIconService(
            makeDataAppVizRow({ template: null, registry_slug: null }),
        );

        const result = await service.updateApp(
            USER,
            'project-1',
            'data-app-viz-1',
            { autoAnalysis: 'on' },
        );

        expect(appModel.updateApp).toHaveBeenCalledWith(
            'data-app-viz-1',
            'project-1',
            { auto_analysis: 'on' },
        );
        expect(result.autoAnalysis).toBe('on');
    });

    it('sets a curated icon', async () => {
        const { service, appModel } = buildIconService(
            makeDataAppVizRow({ registry_slug: null }),
        );

        const result = await service.updateApp(
            USER,
            'project-1',
            'data-app-viz-1',
            { icon: 'gauge' },
        );

        expect(appModel.updateApp).toHaveBeenCalledWith(
            'data-app-viz-1',
            'project-1',
            { icon: 'gauge' },
        );
        expect(result.icon).toBe('gauge');
    });

    it('clears the icon with null', async () => {
        const { service, appModel } = buildIconService(
            makeDataAppVizRow({ registry_slug: null, icon: 'gauge' }),
        );

        const result = await service.updateApp(
            USER,
            'project-1',
            'data-app-viz-1',
            { icon: null },
        );

        expect(appModel.updateApp).toHaveBeenCalledWith(
            'data-app-viz-1',
            'project-1',
            { icon: null },
        );
        expect(result.icon).toBeNull();
    });

    it('reads an icon retired from the curated set back as none', async () => {
        const { service } = buildIconService(
            makeDataAppVizRow({ registry_slug: null, icon: 'retired-icon' }),
        );

        const result = await service.updateApp(
            USER,
            'project-1',
            'data-app-viz-1',
            { name: 'Renamed' },
        );

        expect(result.icon).toBeNull();
    });

    it('requires at least one of name, description or icon', async () => {
        const { service } = buildIconService(
            makeDataAppVizRow({ registry_slug: null }),
        );

        await expect(
            service.updateApp(USER, 'project-1', 'data-app-viz-1', {}),
        ).rejects.toThrow(
            'At least one of name, description, icon or autoAnalysis must be provided',
        );
    });
});

describe('getDataAppVizDeleteImpact', () => {
    it.each([0, 3])(
        'returns the dependent count (%s) for a chart type manager',
        async (chartCount) => {
            const findVisualizationApp = vi
                .fn()
                .mockResolvedValue(makeDataAppVizRow());
            const countChartsUsingDataAppViz = vi
                .fn()
                .mockResolvedValue(chartCount);
            const { service, user } = buildServiceWithRealAbility(
                { findVisualizationApp },
                OrganizationMemberRole.ADMIN,
                'user-1',
                { savedChartModel: { countChartsUsingDataAppViz } },
            );

            await expect(
                service.getDataAppVizDeleteImpact(
                    user,
                    'project-1',
                    'data-app-viz-1',
                ),
            ).resolves.toEqual({ chartCount });
            expect(findVisualizationApp).toHaveBeenCalledWith(
                'data-app-viz-1',
                'project-1',
            );
            expect(countChartsUsingDataAppViz).toHaveBeenCalledWith(
                'project-1',
                'data-app-viz-1',
            );
        },
    );

    it('does not disclose dependent counts to users who cannot manage the chart type', async () => {
        const countChartsUsingDataAppViz = vi.fn();
        const { service, user } = buildServiceWithRealAbility(
            {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            OrganizationMemberRole.VIEWER,
            'other-user',
            { savedChartModel: { countChartsUsingDataAppViz } },
        );

        await expect(
            service.getDataAppVizDeleteImpact(
                user,
                'project-1',
                'data-app-viz-1',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(countChartsUsingDataAppViz).not.toHaveBeenCalled();
    });

    it('rejects a missing chart type before querying dependencies', async () => {
        const countChartsUsingDataAppViz = vi.fn();
        const service = buildService(
            { findVisualizationApp: vi.fn().mockResolvedValue(undefined) },
            { savedChartModel: { countChartsUsingDataAppViz } },
        );

        await expect(
            service.getDataAppVizDeleteImpact(USER, 'project-1', 'missing-viz'),
        ).rejects.toThrow(NotFoundError);
        expect(countChartsUsingDataAppViz).not.toHaveBeenCalled();
    });
});

describe('getDataAppVizUpgradeImpact', () => {
    it('returns consumer and pinned counts for a chart type installer', async () => {
        const findVisualizationApp = vi
            .fn()
            .mockResolvedValue(makeDataAppVizRow());
        const getDataAppVizUsageCounts = vi
            .fn()
            .mockResolvedValue({ chartCount: 5, pinnedChartCount: 3 });
        const { service, user } = buildServiceWithRealAbility(
            { findVisualizationApp },
            OrganizationMemberRole.ADMIN,
            'user-1',
            { savedChartModel: { getDataAppVizUsageCounts } },
        );

        await expect(
            service.getDataAppVizUpgradeImpact(
                user,
                'project-1',
                'data-app-viz-1',
            ),
        ).resolves.toEqual({ chartCount: 5, pinnedChartCount: 3 });
        expect(findVisualizationApp).toHaveBeenCalledWith(
            'data-app-viz-1',
            'project-1',
        );
        expect(getDataAppVizUsageCounts).toHaveBeenCalledWith(
            'project-1',
            'data-app-viz-1',
        );
    });

    it('does not disclose counts to users who cannot install chart types', async () => {
        const getDataAppVizUsageCounts = vi.fn();
        const { service, user } = buildServiceWithRealAbility(
            {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            OrganizationMemberRole.VIEWER,
            'other-user',
            { savedChartModel: { getDataAppVizUsageCounts } },
        );

        await expect(
            service.getDataAppVizUpgradeImpact(
                user,
                'project-1',
                'data-app-viz-1',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(getDataAppVizUsageCounts).not.toHaveBeenCalled();
    });

    it('rejects a missing chart type before querying consumers', async () => {
        const getDataAppVizUsageCounts = vi.fn();
        const service = buildService(
            { findVisualizationApp: vi.fn().mockResolvedValue(undefined) },
            { savedChartModel: { getDataAppVizUsageCounts } },
        );

        await expect(
            service.getDataAppVizUpgradeImpact(
                USER,
                'project-1',
                'missing-viz',
            ),
        ).rejects.toThrow(NotFoundError);
        expect(getDataAppVizUsageCounts).not.toHaveBeenCalled();
    });

    it('is gated on the chart type library flag', async () => {
        const getDataAppVizUsageCounts = vi.fn();
        const service = buildService(
            {
                findVisualizationApp: vi
                    .fn()
                    .mockResolvedValue(makeDataAppVizRow()),
            },
            {
                savedChartModel: { getDataAppVizUsageCounts },
                chartStudioAvailable: false,
                featureFlags: { [FeatureFlags.ChartTypeRegistry]: false },
            },
        );

        await expect(
            service.getDataAppVizUpgradeImpact(
                USER,
                'project-1',
                'data-app-viz-1',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(getDataAppVizUsageCounts).not.toHaveBeenCalled();
    });
});

describe('canUseChartTypes', () => {
    const canUse = (
        role: OrganizationMemberRole,
        projectUuid: string | null,
        featureFlags: Record<string, boolean> = {},
        chartStudioAvailable = true,
    ) => {
        const { service, user } = buildServiceWithRealAbility(
            {},
            role,
            'user-1',
        );
        vi.spyOn(service, 'isChartStudioAvailable').mockReturnValue(
            chartStudioAvailable,
        );
        (service as unknown as { featureFlagModel: unknown }).featureFlagModel =
            {
                get: async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled: featureFlags[featureFlagId] ?? true,
                }),
            };
        return service.canUseChartTypes(user, projectUuid);
    };

    it.each(['project-1', null])(
        'matches the gallery gate for project %s',
        async (projectUuid) => {
            expect(
                await canUse(
                    OrganizationMemberRole.INTERACTIVE_VIEWER,
                    projectUuid,
                ),
            ).toBe(true);
            expect(
                await canUse(OrganizationMemberRole.VIEWER, projectUuid),
            ).toBe(false);
        },
    );

    it('follows Chart Studio availability or the library flag', async () => {
        const off = {
            [FeatureFlags.EnableDataApps]: false,
            [FeatureFlags.ChartTypeRegistry]: false,
        };
        expect(
            await canUse(OrganizationMemberRole.ADMIN, 'project-1', off, false),
        ).toBe(false);
        expect(
            await canUse(
                OrganizationMemberRole.ADMIN,
                'project-1',
                { ...off, [FeatureFlags.ChartTypeRegistry]: true },
                false,
            ),
        ).toBe(true);
        expect(
            await canUse(OrganizationMemberRole.ADMIN, 'project-1', off, true),
        ).toBe(true);
    });
});

describe('assertCanIterateApp', () => {
    it.each([
        [
            'the creator of a personal app',
            OrganizationMemberRole.EDITOR,
            'user-1',
        ],
        ['an admin', OrganizationMemberRole.ADMIN, 'other-user'],
    ])('allows %s', async (_label, role, userUuid) => {
        const getApp = vi.fn().mockResolvedValue(makeDataAppVizRow());
        const { service, user } = buildServiceWithRealAbility(
            { getApp },
            role,
            userUuid,
        );

        await expect(
            service.assertCanIterateApp(user, 'project-1', 'data-app-viz-1'),
        ).resolves.toBeUndefined();
        expect(getApp).toHaveBeenCalledWith('data-app-viz-1', 'project-1');
    });

    it("refuses an editor on another user's personal app with iterateApp's error", async () => {
        const { service, user } = buildServiceWithRealAbility(
            { getApp: vi.fn().mockResolvedValue(makeDataAppVizRow()) },
            OrganizationMemberRole.EDITOR,
            'other-user',
        );

        await expect(
            service.assertCanIterateApp(user, 'project-1', 'data-app-viz-1'),
        ).rejects.toThrow(
            new ForbiddenError('Insufficient permissions to modify data apps'),
        );
    });

    it('allows a chart type with data apps off when Chart Studio is available', async () => {
        const getApp = vi.fn().mockResolvedValue(makeDataAppVizRow());
        const service = buildService(
            { getApp },
            { featureFlags: { [FeatureFlags.EnableDataApps]: false } },
        );

        await expect(
            service.assertCanIterateApp(USER, 'project-1', 'data-app-viz-1'),
        ).resolves.toBeUndefined();
    });

    it('refuses a chart type when Chart Studio is not available', async () => {
        const service = buildService(
            { getApp: vi.fn().mockResolvedValue(makeDataAppVizRow()) },
            { chartStudioAvailable: false },
        );

        await expect(
            service.assertCanIterateApp(USER, 'project-1', 'data-app-viz-1'),
        ).rejects.toThrow(new ForbiddenError('Chart Studio is not available'));
    });

    it('refuses a data app when data apps are off, even with Chart Studio available', async () => {
        const service = buildService(
            {
                getApp: vi
                    .fn()
                    .mockResolvedValue(
                        makeDataAppVizRow({ template: 'dashboard' }),
                    ),
            },
            { featureFlags: { [FeatureFlags.EnableDataApps]: false } },
        );

        await expect(
            service.assertCanIterateApp(USER, 'project-1', 'data-app-viz-1'),
        ).rejects.toThrow(new ForbiddenError('Data apps are not enabled'));
    });
});

describe('chart types with data apps off while Chart Studio is available', () => {
    const dataAppsOff = {
        featureFlags: { [FeatureFlags.EnableDataApps]: false },
    };
    const dataAppRow = () =>
        makeDataAppVizRow({ app_id: 'data-app-1', template: null });
    const disabled = new ForbiddenError('Data apps are not enabled');
    const gateErrors = new Set([
        'Data apps are not enabled',
        'Chart Studio is not available',
    ]);
    const settle = (promise: Promise<unknown>) =>
        promise.then(
            () => null,
            (error: Error) => error,
        );

    const APP_UUID = '7f9c8f8e-2b52-4d8e-9a43-3d4f1b6a2c10';
    const byGetApp = (row: unknown) => ({
        getApp: vi.fn().mockResolvedValue(row),
    });
    const appGatedCalls: {
        name: string;
        appModelStubs: (row: unknown) => Record<string, unknown>;
        call: (service: AppGenerateService) => Promise<unknown>;
    }[] = [
        {
            name: 'getPreviewToken',
            appModelStubs: byGetApp,
            call: (service) =>
                service.getPreviewToken(USER, 'project-1', APP_UUID, 1),
        },
        {
            name: 'duplicateApp',
            appModelStubs: (row) => ({
                ...byGetApp(row),
                getLatestReadyVersion: vi.fn().mockResolvedValue(undefined),
            }),
            call: (service) =>
                service.duplicateApp(USER, 'project-1', APP_UUID),
        },
        {
            name: 'moveToSpace',
            appModelStubs: (row) => ({
                ...byGetApp(row),
                moveToSpace: vi.fn(),
            }),
            call: (service) =>
                service.moveToSpace(USER, {
                    projectUuid: 'project-1',
                    itemUuid: APP_UUID,
                    targetSpaceUuid: 'space-1',
                }),
        },
        {
            name: 'getDataAppBuildStatus',
            appModelStubs: (row) => ({
                findAppBySlug: vi.fn().mockResolvedValue(row),
                getLatestVersion: vi.fn().mockResolvedValue({
                    version: 1,
                    status: 'ready',
                    error: null,
                    status_message: null,
                }),
            }),
            call: (service) =>
                service.getDataAppBuildStatus(USER, 'project-1', 'app-slug'),
        },
        {
            name: 'getAppVersions',
            appModelStubs: (row) => ({
                getAppByUuidOrSlug: vi.fn().mockResolvedValue(row),
            }),
            call: (service) =>
                service.getAppVersions(USER, 'project-1', APP_UUID, {}),
        },
        {
            name: 'updateApp',
            appModelStubs: byGetApp,
            call: (service) =>
                service.updateApp(USER, 'project-1', APP_UUID, {
                    name: 'Renamed',
                }),
        },
        {
            name: 'upgradeApp',
            appModelStubs: byGetApp,
            call: (service) => service.upgradeApp(USER, 'project-1', APP_UUID),
        },
        {
            name: 'restoreVersion',
            appModelStubs: byGetApp,
            call: (service) =>
                service.restoreVersion(USER, 'project-1', APP_UUID, 1),
        },
        {
            name: 'clearAgentContext',
            appModelStubs: byGetApp,
            call: (service) =>
                service.clearAgentContext(USER, 'project-1', APP_UUID),
        },
        {
            name: 'cancelVersion',
            appModelStubs: byGetApp,
            call: (service) =>
                service.cancelVersion(USER, 'project-1', APP_UUID, 1),
        },
        {
            name: 'promoteApp',
            appModelStubs: byGetApp,
            call: (service) => service.promoteApp(USER, 'project-1', APP_UUID),
        },
        {
            name: 'getPromoteAppDiff',
            appModelStubs: byGetApp,
            call: (service) =>
                service.getPromoteAppDiff(USER, 'project-1', APP_UUID),
        },
        {
            name: 'deleteThumbnail',
            appModelStubs: byGetApp,
            call: (service) =>
                service.deleteThumbnail(USER, 'project-1', APP_UUID, null),
        },
        {
            name: 'uploadThumbnail',
            appModelStubs: byGetApp,
            call: (service) =>
                service.uploadThumbnail(
                    USER,
                    'project-1',
                    'image/png',
                    Readable.from([]),
                    0,
                    APP_UUID,
                    null,
                ),
        },
        // User-authored chart types (no library install) follow Chart Studio.
        {
            name: 'deleteApp',
            appModelStubs: (row) =>
                byGetApp({ ...(row as object), registry_slug: null }),
            call: (service) => service.deleteApp(USER, 'project-1', APP_UUID),
        },
        {
            name: 'restoreApp',
            appModelStubs: (row) => ({
                getAppIncludingDeleted: vi.fn().mockResolvedValue({
                    ...(row as object),
                    registry_slug: null,
                }),
            }),
            call: (service) => service.restoreApp(USER, 'project-1', APP_UUID),
        },
        {
            name: 'permanentDeleteApp',
            appModelStubs: (row) => ({
                getAppIncludingDeleted: vi.fn().mockResolvedValue({
                    ...(row as object),
                    registry_slug: null,
                }),
            }),
            call: (service) =>
                service.permanentDeleteApp(USER, 'project-1', APP_UUID),
        },
        {
            name: 'getDataAppVizDeleteImpact',
            appModelStubs: (row) => ({
                findVisualizationApp: vi.fn().mockResolvedValue({
                    ...(row as object),
                    registry_slug: null,
                }),
            }),
            call: (service) =>
                service.getDataAppVizDeleteImpact(USER, 'project-1', APP_UUID),
        },
        {
            name: 'getImageUrl',
            appModelStubs: byGetApp,
            call: (service) =>
                service.getImageUrl(USER, 'project-1', APP_UUID, APP_UUID),
        },
        {
            name: 'uploadFile',
            appModelStubs: (row) => ({
                findApp: vi.fn().mockResolvedValue(row),
            }),
            call: (service) =>
                service.uploadFile(
                    USER,
                    'project-1',
                    'image/png',
                    Readable.from([]),
                    0,
                    APP_UUID,
                ),
        },
        {
            name: 'getDataAppPromoteChanges',
            appModelStubs: (row) => ({
                findApp: vi.fn().mockResolvedValue(row),
            }),
            call: (service) => {
                vi.spyOn(
                    service as unknown as {
                        getUpstreamProjectForPromotion: () => Promise<unknown>;
                    },
                    'getUpstreamProjectForPromotion',
                ).mockResolvedValue({
                    upstreamProjectUuid: 'upstream-project',
                    upstreamProjectName: 'Production',
                    upstreamOrganizationUuid: 'org-1',
                });
                return service.getDataAppPromoteChanges(USER, 'project-1', [
                    APP_UUID,
                ]);
            },
        },
    ];

    it.each(appGatedCalls)(
        '$name lets a chart type through the gate and refuses a data app',
        async ({ appModelStubs, call }) => {
            const passed = await settle(
                call(
                    buildService(
                        appModelStubs(makeDataAppVizRow()),
                        dataAppsOff,
                    ),
                ),
            );
            expect(gateErrors.has(passed?.message ?? '')).toBe(false);

            await expect(
                call(buildService(appModelStubs(dataAppRow()), dataAppsOff)),
            ).rejects.toThrow(disabled);
        },
    );

    // The library flag keeps chart types usable, so a call site that wrongly
    // used the usage gate would let this through.
    it.each(appGatedCalls)(
        '$name refuses a chart type without Chart Studio, even with the library flag on',
        async ({ appModelStubs, call }) => {
            await expect(
                call(
                    buildService(appModelStubs(makeDataAppVizRow()), {
                        chartStudioAvailable: false,
                        featureFlags: {
                            [FeatureFlags.EnableDataApps]: false,
                            [FeatureFlags.ChartTypeRegistry]: true,
                        },
                    }),
                ),
            ).rejects.toThrow(
                new ForbiddenError('Chart Studio is not available'),
            );
        },
    );

    it.each([
        {
            name: 'getThumbnailUrl',
            call: (service: AppGenerateService) =>
                service.getThumbnailUrl(USER, 'project-1', APP_UUID),
        },
        {
            name: 'getVersionThumbnailUrl',
            call: (service: AppGenerateService) =>
                service.getVersionThumbnailUrl(USER, 'project-1', APP_UUID, 1),
        },
    ])(
        '$name shows a chart type wherever chart types are usable and refuses a data app',
        async ({ call }) => {
            const passed = await settle(
                call(buildService(byGetApp(makeDataAppVizRow()), dataAppsOff)),
            );
            expect(gateErrors.has(passed?.message ?? '')).toBe(false);

            const libraryOnly = await settle(
                call(
                    buildService(byGetApp(makeDataAppVizRow()), {
                        chartStudioAvailable: false,
                        featureFlags: {
                            [FeatureFlags.EnableDataApps]: false,
                            [FeatureFlags.ChartTypeRegistry]: true,
                        },
                    }),
                ),
            );
            expect(gateErrors.has(libraryOnly?.message ?? '')).toBe(false);
            expect(libraryOnly?.message).not.toBe(
                'Chart types are not enabled',
            );

            await expect(
                call(
                    buildService(byGetApp(makeDataAppVizRow()), {
                        chartStudioAvailable: false,
                        featureFlags: {
                            [FeatureFlags.EnableDataApps]: false,
                            [FeatureFlags.ChartTypeRegistry]: false,
                        },
                    }),
                ),
            ).rejects.toThrow('Chart types are not enabled');

            await expect(
                call(buildService(byGetApp(dataAppRow()), dataAppsOff)),
            ).rejects.toThrow(disabled);
        },
    );

    it.each([
        {
            name: 'listLinkableExternalConnections',
            call: (service: AppGenerateService) =>
                service.listLinkableExternalConnections(USER, 'project-1'),
        },
        {
            name: 'uploadFile before the app exists',
            call: (service: AppGenerateService) =>
                service.uploadFile(
                    USER,
                    'project-1',
                    'image/png',
                    Readable.from([]),
                    11 * 1024 * 1024,
                    'new-app-uuid',
                ),
        },
    ])(
        '$name passes with either Chart Studio or data apps and refuses without both',
        async ({ call }) => {
            const appModel = { findApp: vi.fn().mockResolvedValue(undefined) };
            const passed = await settle(
                call(buildService(appModel, dataAppsOff)),
            );
            expect(gateErrors.has(passed?.message ?? '')).toBe(false);

            const dataAppsOnly = await settle(
                call(
                    buildService(appModel, {
                        chartStudioAvailable: false,
                        featureFlags: { [FeatureFlags.EnableDataApps]: true },
                    }),
                ),
            );
            expect(gateErrors.has(dataAppsOnly?.message ?? '')).toBe(false);

            await expect(
                call(
                    buildService(appModel, {
                        ...dataAppsOff,
                        chartStudioAvailable: false,
                    }),
                ),
            ).rejects.toThrow(disabled);
        },
    );

    describe('promoting with a dashboard', () => {
        const stubPromotion = (service: AppGenerateService) => {
            const internals = service as unknown as {
                getUpstreamProjectForPromotion: () => Promise<unknown>;
                findLinkedUpstreamApp: () => Promise<unknown>;
                assertCanManageApp: () => Promise<unknown>;
            };
            vi.spyOn(
                internals,
                'getUpstreamProjectForPromotion',
            ).mockResolvedValue({
                upstreamProjectUuid: 'upstream-project',
                upstreamProjectName: 'Production',
                upstreamOrganizationUuid: 'org-1',
            });
            vi.spyOn(internals, 'findLinkedUpstreamApp').mockResolvedValue(
                undefined,
            );
            vi.spyOn(internals, 'assertCanManageApp').mockResolvedValue({
                directOnly: false,
            });
            return vi.spyOn(service, 'promoteApp').mockResolvedValue({
                appUuid: 'upstream-app',
                projectUuid: 'upstream-project',
                version: 1,
                action: 'create',
            });
        };

        it('promotes a chart type bound by a chart', async () => {
            const service = buildService(
                {
                    findApp: vi.fn().mockResolvedValue(makeDataAppVizRow()),
                },
                dataAppsOff,
            );
            const promoteApp = stubPromotion(service);

            await expect(
                service.promoteAppsForDashboard(USER, 'project-1', [
                    'data-app-viz-1',
                ]),
            ).resolves.toEqual([
                {
                    sourceAppUuid: 'data-app-viz-1',
                    upstreamAppUuid: 'upstream-app',
                    upstreamAppVersion: 1,
                },
            ]);
            expect(promoteApp).toHaveBeenCalledWith(
                USER,
                'project-1',
                'data-app-viz-1',
            );
            await expect(
                service.getDataAppPromoteChanges(USER, 'project-1', [
                    'data-app-viz-1',
                ]),
            ).resolves.toEqual([
                {
                    uuid: 'data-app-viz-1',
                    name: 'Radial gauge',
                    action: 'create',
                },
            ]);
        });

        it('refuses a data app and promotes nothing', async () => {
            const findApp = vi
                .fn()
                .mockImplementation(async (appUuid: string) =>
                    appUuid === 'data-app-1'
                        ? dataAppRow()
                        : makeDataAppVizRow(),
                );
            const service = buildService({ findApp }, dataAppsOff);
            const promoteApp = stubPromotion(service);

            await expect(
                service.promoteAppsForDashboard(USER, 'project-1', [
                    'data-app-viz-1',
                    'data-app-1',
                ]),
            ).rejects.toThrow(disabled);
            expect(promoteApp).not.toHaveBeenCalled();
            await expect(
                service.getDataAppPromoteChanges(USER, 'project-1', [
                    'data-app-1',
                ]),
            ).rejects.toThrow(disabled);
        });
    });
});
