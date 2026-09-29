import {
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    type GenerateOrganizationChartTypeRequestBody,
    type SessionUser,
} from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn(async () => 'https://s3.example/signed'),
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const ORG_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_UUID = '22222222-2222-4222-8222-222222222222';
const APP_UUID = '33333333-3333-4333-8333-333333333333';
const USER_UUID = '44444444-4444-4444-8444-444444444444';
const PROJECT_UUID = '55555555-5555-4555-8555-555555555555';
const OTHER_ORG_PROJECT_UUID = '66666666-6666-4666-8666-666666666666';
const MISSING_PROJECT_UUID = '77777777-7777-4777-8777-777777777777';
const IMAGE_UUID = '88888888-8888-4888-8888-888888888888';

type Persona = 'admin' | 'chartBuilder' | 'outsider';

const makeUser = (persona: Persona): SessionUser => {
    const { builder } = getUserAbilityBuilder({
        user: {
            role:
                persona === 'admin'
                    ? OrganizationMemberRole.ADMIN
                    : OrganizationMemberRole.MEMBER,
            organizationUuid: ORG_UUID,
            userUuid: USER_UUID,
        },
        projectProfiles:
            persona === 'chartBuilder'
                ? [
                      {
                          projectUuid: PROJECT_UUID,
                          organizationUuid: ORG_UUID,
                          userUuid: USER_UUID,
                          role: ProjectMemberRole.EDITOR,
                          roleUuid: undefined,
                      },
                  ]
                : [],
        permissionsConfig: { pat: { enabled: false, allowedOrgRoles: [] } },
        customRoleScopes: {},
        customRolesEnabled: false,
        isEnterprise: true,
    });
    return {
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
        ability: builder.build(),
        isActive: true,
    } as unknown as SessionUser;
};

const orgChartType = (overrides: Record<string, unknown> = {}) => ({
    app_id: APP_UUID,
    name: 'Heatmap',
    description: '',
    slug: 'heatmap',
    project_uuid: null,
    owner_organization_uuid: ORG_UUID,
    space_uuid: null,
    template: DATA_APP_VIZ_TEMPLATE,
    sandbox_id: null,
    icon: null,
    auto_analysis: 'inherit',
    design_uuid: null,
    registry_slug: null,
    created_at: new Date('2026-09-01T00:00:00Z'),
    created_by_user_uuid: USER_UUID,
    viz_schema: null,
    ...overrides,
});

const buildService = ({
    flags = {},
    organizationLibraryEnabled = true,
    softDelete = true,
}: {
    flags?: Partial<Record<FeatureFlags, boolean>>;
    organizationLibraryEnabled?: boolean;
    softDelete?: boolean;
} = {}) => {
    const appModel = {
        findOrganizationVisualizationByUuid: vi
            .fn()
            .mockResolvedValue(orgChartType()),
        findOrganizationVisualizationByUuidOrSlug: vi
            .fn()
            .mockResolvedValue(orgChartType()),
        listOrganizationVisualizations: vi.fn().mockResolvedValue({
            data: [
                orgChartType({
                    viz_schema: { fields: [], configOptions: [] },
                }),
            ],
            pagination: undefined,
        }),
        createOrganizationVisualizationWithVersion: vi
            .fn()
            .mockResolvedValue({ app: orgChartType({ slug: 'app-7' }) }),
        getLatestVersion: vi.fn().mockResolvedValue({
            version: 2,
            status: 'ready',
            dependencies: null,
            viz_preview: null,
            created_at: new Date(),
        }),
        createVersion: vi.fn().mockResolvedValue(undefined),
        getOrganizationAppWithVersions: vi.fn().mockResolvedValue({
            name: 'Heatmap',
            description: '',
            icon: null,
            autoAnalysis: 'inherit',
            createdByUserUuid: USER_UUID,
            organizationUuid: ORG_UUID,
            spaceUuid: null,
            spaceName: null,
            template: DATA_APP_VIZ_TEMPLATE,
            pinnedListUuid: null,
            pinnedListOrder: null,
            slug: 'heatmap',
            viewsCount: 0,
            currentThread: {
                app_thread_uuid: 'thread-1',
                thread_number: 1,
                created_at: new Date(),
            },
            versions: [],
            hasMore: false,
            registrySlug: null,
        }),
        getLatestReadyVersion: vi.fn().mockResolvedValue({ version: 2 }),
        updateOrganizationVisualization: vi
            .fn()
            .mockImplementation(async (_appUuid, _org, update) =>
                orgChartType(update),
            ),
        softDeleteOrganizationVisualization: vi
            .fn()
            .mockResolvedValue(undefined),
        permanentDeleteOrganizationVisualization: vi
            .fn()
            .mockResolvedValue(undefined),
        hasAppUuid: vi.fn().mockResolvedValue(false),
        appImageExists: vi.fn().mockResolvedValue(true),
        findApp: vi.fn().mockResolvedValue(undefined),
        getApp: vi.fn(),
    };
    const featureFlags: Partial<Record<FeatureFlags, boolean>> = {
        [FeatureFlags.OrganizationChartTypes]: true,
        [FeatureFlags.EnableDataApps]: true,
        [FeatureFlags.ChartTypeRegistry]: true,
        ...flags,
    };
    const featureFlagModel = {
        get: vi.fn(
            async ({ featureFlagId }: { featureFlagId: FeatureFlags }) => ({
                id: featureFlagId,
                enabled: featureFlags[featureFlagId] ?? false,
            }),
        ),
    };
    const schedulerClient = {
        appGeneratePipeline: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
    };
    const analytics = { track: vi.fn() };
    const projectModel = {
        getSummary: vi.fn(async (projectUuid: string) => {
            if (projectUuid === MISSING_PROJECT_UUID) {
                throw new NotFoundError(
                    `Cannot find project with id: ${projectUuid}`,
                );
            }
            return {
                projectUuid,
                organizationUuid:
                    projectUuid === OTHER_ORG_PROJECT_UUID
                        ? OTHER_ORG_UUID
                        : ORG_UUID,
            };
        }),
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn(),
        findServiceAccountByUserUuid: vi.fn(),
    };
    const service = new AppGenerateService({
        organizationSettingsModel: {
            get: vi.fn().mockResolvedValue({
                organizationChartTypesEnabled: organizationLibraryEnabled,
            }),
        },
        lightdashConfig: {
            appRuntime: { sampleDataEnabled: true },
            softDelete: { enabled: softDelete },
            lightdashSecrets: { active: 'secret', all: ['secret'] },
        } as never,
        analytics: analytics as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: userModel as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {
            getDefault: vi.fn().mockResolvedValue(null),
        } as never,
        pinnedListModel: {} as never,
        projectModel: projectModel as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            getBrowserImageOrigins: vi.fn().mockResolvedValue([]),
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            getDataAppModelVisibility: async () => null,
        } as never,
        sandboxManager: null,
        appRuntimeS3: { client: {}, bucket: 'app-runtime' } as never,
        chartRegistryClient: {} as never,
        contentVerificationModel: {} as never,
    });
    return {
        service,
        appModel,
        schedulerClient,
        analytics,
        userModel,
    };
};

describe('AppGenerateService organization chart types', () => {
    describe('authorization', () => {
        it('lets an admin with no project role generate with sample data', async () => {
            const { service, appModel, schedulerClient } = buildService();

            const result = await service.generateOrganizationChartType(
                makeUser('admin'),
                {
                    prompt: 'a calendar heatmap',
                    appUuid: APP_UUID,
                    dataProjectUuid: null,
                },
            );

            expect(result).toEqual({
                appUuid: APP_UUID,
                slug: 'app-7',
                version: 1,
            });
            expect(
                appModel.createOrganizationVisualizationWithVersion,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    appUuid: APP_UUID,
                    organizationUuid: ORG_UUID,
                    name: null,
                }),
                { version: 1, prompt: 'a calendar heatmap' },
                'pending',
            );
            expect(schedulerClient.appGeneratePipeline).toHaveBeenCalledWith(
                expect.objectContaining({
                    appUuid: APP_UUID,
                    projectUuid: null,
                    organizationUuid: ORG_UUID,
                    template: DATA_APP_VIZ_TEMPLATE,
                    isIteration: false,
                }),
            );
        });

        it('lets a chart builder read but not write', async () => {
            const { service, appModel, schedulerClient } = buildService();
            const user = makeUser('chartBuilder');

            await expect(
                service.listOrganizationChartTypes(user),
            ).resolves.toMatchObject({
                data: [
                    {
                        dataAppVizUuid: APP_UUID,
                        organizationUuid: ORG_UUID,
                        projectUuid: null,
                        spaceUuid: null,
                    },
                ],
            });
            await expect(
                service.getOrganizationChartType(user, 'heatmap', {}),
            ).resolves.toMatchObject({ appUuid: APP_UUID, spaceUuid: null });
            await expect(
                service.getOrganizationChartTypePreviewToken(user, APP_UUID, 2),
            ).resolves.toEqual(expect.any(String));

            await expect(
                service.generateOrganizationChartType(user, {
                    prompt: 'a heatmap',
                    dataProjectUuid: null,
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.iterateOrganizationChartType(user, APP_UUID, {
                    prompt: 'make it blue',
                    dataProjectUuid: null,
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.restoreOrganizationChartTypeVersion(user, APP_UUID, 1),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.updateOrganizationChartType(user, APP_UUID, {
                    name: 'Renamed',
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.deleteOrganizationChartType(user, APP_UUID),
            ).rejects.toThrow(ForbiddenError);
            expect(
                appModel.createOrganizationVisualizationWithVersion,
            ).not.toHaveBeenCalled();
            expect(appModel.createVersion).not.toHaveBeenCalled();
            expect(
                appModel.updateOrganizationVisualization,
            ).not.toHaveBeenCalled();
            expect(
                appModel.softDeleteOrganizationVisualization,
            ).not.toHaveBeenCalled();
            expect(schedulerClient.appGeneratePipeline).not.toHaveBeenCalled();
        });

        it('forbids reads to a user who cannot build charts in the organization', async () => {
            const { service } = buildService();
            const user = makeUser('outsider');

            await expect(
                service.listOrganizationChartTypes(user),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getOrganizationChartType(user, APP_UUID, {}),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getOrganizationChartTypeRenderMetadata(user, APP_UUID),
            ).rejects.toThrow(ForbiddenError);
        });

        it('scopes lookups to the user organization', async () => {
            const { service, appModel } = buildService();
            appModel.findOrganizationVisualizationByUuid.mockResolvedValue(
                undefined,
            );

            await expect(
                service.deleteOrganizationChartType(
                    makeUser('admin'),
                    APP_UUID,
                ),
            ).rejects.toThrow(NotFoundError);
            expect(
                appModel.findOrganizationVisualizationByUuid,
            ).toHaveBeenCalledWith(ORG_UUID, APP_UUID);
        });
    });

    describe('error order', () => {
        const renderMetadataError = async (
            service: AppGenerateService,
            user: SessionUser,
        ) =>
            service.getOrganizationChartTypeRenderMetadata(user, APP_UUID).then(
                () => null,
                (error: unknown) => error,
            );

        it.each([
            [
                'the rollout flag is off',
                { [FeatureFlags.OrganizationChartTypes]: false },
                'admin',
            ],
            ['the caller is an outsider', {}, 'outsider'],
        ] as const)(
            'answers the same whether the uuid exists when %s',
            async (_label, flags, persona) => {
                const existing = buildService({ flags });
                const missing = buildService({ flags });
                missing.appModel.findOrganizationVisualizationByUuid.mockResolvedValue(
                    undefined,
                );

                const existingError = await renderMetadataError(
                    existing.service,
                    makeUser(persona),
                );
                const missingError = await renderMetadataError(
                    missing.service,
                    makeUser(persona),
                );

                expect(existingError).toBeInstanceOf(ForbiddenError);
                expect(missingError).toEqual(existingError);
                expect(
                    existing.appModel.findOrganizationVisualizationByUuid,
                ).not.toHaveBeenCalled();
                expect(
                    missing.appModel.findOrganizationVisualizationByUuid,
                ).not.toHaveBeenCalled();
            },
        );
    });

    describe('gates', () => {
        it('forbids every route while the rollout flag is off', async () => {
            const { service } = buildService({
                flags: { [FeatureFlags.OrganizationChartTypes]: false },
            });
            const admin = makeUser('admin');

            await expect(
                service.listOrganizationChartTypes(admin),
            ).rejects.toThrow(
                'Organization chart types are not enabled for this organization.',
            );
            await expect(
                service.generateOrganizationChartType(admin, {
                    prompt: 'x',
                    dataProjectUuid: null,
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getOrganizationChartType(admin, APP_UUID, {}),
            ).rejects.toThrow(ForbiddenError);
        });

        it('rejects reads and writes while the organization library is off, without changing data', async () => {
            const { service, appModel } = buildService({
                organizationLibraryEnabled: false,
            });
            const admin = makeUser('admin');

            await expect(
                service.listOrganizationChartTypes(admin),
            ).rejects.toThrow('The organization library is turned off');
            await expect(
                service.updateOrganizationChartType(admin, APP_UUID, {
                    name: 'Renamed',
                }),
            ).rejects.toThrow('The organization library is turned off');
            expect(
                appModel.updateOrganizationVisualization,
            ).not.toHaveBeenCalled();
        });

        it('requires data apps for writes', async () => {
            const { service } = buildService({
                flags: { [FeatureFlags.EnableDataApps]: false },
            });

            await expect(
                service.generateOrganizationChartType(makeUser('admin'), {
                    prompt: 'x',
                    dataProjectUuid: null,
                }),
            ).rejects.toThrow('Data apps are not enabled');
        });
    });

    describe('build inputs', () => {
        it('rejects external connections a client sends anyway', async () => {
            const { service, schedulerClient } = buildService();
            const body = {
                prompt: 'x',
                dataProjectUuid: null,
                externalConnections: [
                    { externalConnectionUuid: 'conn-1', alias: 'weather' },
                ],
            } as GenerateOrganizationChartTypeRequestBody;

            await expect(
                service.generateOrganizationChartType(makeUser('admin'), body),
            ).rejects.toThrow(ParameterError);
            await expect(
                service.iterateOrganizationChartType(
                    makeUser('admin'),
                    APP_UUID,
                    body,
                ),
            ).rejects.toThrow(ParameterError);
            expect(schedulerClient.appGeneratePipeline).not.toHaveBeenCalled();
        });

        it('reports a missing data project and one from another organization alike', async () => {
            const { service, appModel } = buildService();
            const generate = (dataProjectUuid: string) =>
                service.generateOrganizationChartType(makeUser('admin'), {
                    prompt: 'x',
                    dataProjectUuid,
                });

            const errors = await Promise.all(
                [OTHER_ORG_PROJECT_UUID, MISSING_PROJECT_UUID].map((uuid) =>
                    generate(uuid).then(
                        () => null,
                        (error: unknown) => error,
                    ),
                ),
            );
            expect(errors.map((error) => error?.constructor)).toEqual([
                NotFoundError,
                NotFoundError,
            ]);
            expect((errors[0] as Error).message).toBe(
                `Data project not found: ${OTHER_ORG_PROJECT_UUID}`,
            );
            expect((errors[1] as Error).message).toBe(
                `Data project not found: ${MISSING_PROJECT_UUID}`,
            );
            expect(
                appModel.createOrganizationVisualizationWithVersion,
            ).not.toHaveBeenCalled();
        });

        it('rejects a data project that is not a uuid', async () => {
            const { service } = buildService();

            await expect(
                service.clarifyOrganizationChartType(makeUser('admin'), {
                    prompt: 'x',
                    dataProjectUuid: 'not-a-uuid',
                }),
            ).rejects.toThrow(ParameterError);
        });

        it('requires a data project to reference charts', async () => {
            const { service } = buildService();

            await expect(
                service.generateOrganizationChartType(makeUser('admin'), {
                    prompt: 'x',
                    charts: [{ uuid: 'chart-1', includeSampleData: false }],
                    dataProjectUuid: null,
                }),
            ).rejects.toThrow(ParameterError);
        });

        it('queues an iteration with no project', async () => {
            const { service, appModel, schedulerClient } = buildService();

            const result = await service.iterateOrganizationChartType(
                makeUser('admin'),
                APP_UUID,
                { prompt: 'make it blue', dataProjectUuid: PROJECT_UUID },
            );

            expect(result).toEqual({
                appUuid: APP_UUID,
                slug: 'heatmap',
                version: 3,
            });
            expect(appModel.createVersion).toHaveBeenCalledWith(
                APP_UUID,
                { version: 3, prompt: 'make it blue' },
                'pending',
                USER_UUID,
                expect.objectContaining({ externalConnections: [] }),
                undefined,
                undefined,
                { vizPreview: null },
            );
            expect(schedulerClient.appGeneratePipeline).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: null,
                    version: 3,
                    isIteration: true,
                }),
            );
        });
    });

    describe('upload', () => {
        const upload = (
            service: AppGenerateService,
            user: SessionUser,
        ): Promise<unknown> =>
            service.uploadOrganizationChartTypeFile(
                user,
                'image/png',
                {} as never,
                10,
                APP_UUID,
            );

        it('forbids a chart builder from staging files', async () => {
            const { service } = buildService();

            await expect(
                upload(service, makeUser('chartBuilder')),
            ).rejects.toThrow(ForbiddenError);
        });

        it('rejects a new chart type uuid another app already holds', async () => {
            const { service, appModel } = buildService();
            appModel.findOrganizationVisualizationByUuid.mockResolvedValue(
                undefined,
            );
            appModel.hasAppUuid.mockResolvedValue(true);

            await expect(upload(service, makeUser('admin'))).rejects.toThrow(
                'Insufficient permissions to upload app files',
            );
        });
    });

    describe('images', () => {
        it('signs an image of the chart type for a user who can view it', async () => {
            const { service, appModel } = buildService();

            await expect(
                service.getOrganizationChartTypeImageUrl(
                    makeUser('chartBuilder'),
                    APP_UUID,
                    IMAGE_UUID,
                ),
            ).resolves.toEqual({ imageUrl: 'https://s3.example/signed' });
            expect(
                appModel.findOrganizationVisualizationByUuid,
            ).toHaveBeenCalledWith(ORG_UUID, APP_UUID);
            expect(appModel.appImageExists).toHaveBeenCalledWith(
                APP_UUID,
                IMAGE_UUID,
            );
        });

        it('forbids a user who cannot view organization chart types', async () => {
            const { service, appModel } = buildService();

            await expect(
                service.getOrganizationChartTypeImageUrl(
                    makeUser('outsider'),
                    APP_UUID,
                    IMAGE_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(appModel.appImageExists).not.toHaveBeenCalled();
        });

        it('rejects an image outside the chart type or an invalid image id', async () => {
            const { service, appModel } = buildService();
            appModel.appImageExists.mockResolvedValue(false);
            const admin = makeUser('admin');

            await expect(
                service.getOrganizationChartTypeImageUrl(
                    admin,
                    APP_UUID,
                    IMAGE_UUID,
                ),
            ).rejects.toThrow(NotFoundError);
            await expect(
                service.getOrganizationChartTypeImageUrl(
                    admin,
                    APP_UUID,
                    'not-a-uuid',
                ),
            ).rejects.toThrow(ParameterError);
        });

        it('does not sign images of a chart type outside the organization', async () => {
            const { service, appModel } = buildService();
            appModel.findOrganizationVisualizationByUuid.mockResolvedValue(
                undefined,
            );

            await expect(
                service.getOrganizationChartTypeImageUrl(
                    makeUser('admin'),
                    APP_UUID,
                    IMAGE_UUID,
                ),
            ).rejects.toThrow(NotFoundError);
            expect(appModel.appImageExists).not.toHaveBeenCalled();
        });
    });

    describe('project upload', () => {
        it('rejects a new project app uuid another app already holds', async () => {
            const { service, appModel } = buildService();
            appModel.hasAppUuid.mockResolvedValue(true);

            await expect(
                service.uploadFile(
                    makeUser('admin'),
                    PROJECT_UUID,
                    'image/png',
                    {} as never,
                    10,
                    APP_UUID,
                ),
            ).rejects.toThrow(
                new ForbiddenError(
                    'Insufficient permissions to upload app files',
                ),
            );
            expect(appModel.findApp).toHaveBeenCalledWith(
                APP_UUID,
                PROJECT_UUID,
            );
            expect(appModel.hasAppUuid).toHaveBeenCalledWith(APP_UUID);
        });
    });

    describe('delete', () => {
        it('reports no delete impact and soft deletes within the organization', async () => {
            const { service, appModel, analytics } = buildService();
            const admin = makeUser('admin');

            await expect(
                service.getOrganizationChartTypeDeleteImpact(admin, APP_UUID),
            ).resolves.toEqual({ chartCount: 0 });
            await service.deleteOrganizationChartType(admin, APP_UUID);

            expect(
                appModel.softDeleteOrganizationVisualization,
            ).toHaveBeenCalledWith(APP_UUID, ORG_UUID, USER_UUID);
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'data_app.deleted',
                    properties: expect.objectContaining({ projectId: null }),
                }),
            );
        });
    });

    describe('pipeline authorization', () => {
        const payload = {
            appUuid: APP_UUID,
            projectUuid: null,
            organizationUuid: ORG_UUID,
            userUuid: USER_UUID,
        };
        const authorize = (service: AppGenerateService) =>
            (
                service as unknown as {
                    authorizePipelineExecution: (
                        p: typeof payload,
                    ) => Promise<SessionUser>;
                }
            ).authorizePipelineExecution(payload);

        it('re-authorizes an organization build against its organization', async () => {
            const { service, userModel, appModel } = buildService();
            userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                makeUser('admin'),
            );

            await expect(authorize(service)).resolves.toMatchObject({
                userUuid: USER_UUID,
            });
            expect(
                appModel.findOrganizationVisualizationByUuid,
            ).toHaveBeenCalledWith(ORG_UUID, APP_UUID);
            expect(appModel.getApp).not.toHaveBeenCalled();
        });

        it('stops a queued build once the principal can no longer manage it', async () => {
            const { service, userModel } = buildService();
            userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                makeUser('chartBuilder'),
            );

            await expect(authorize(service)).rejects.toThrow(ForbiddenError);
        });

        it('stops a queued build once the organization library is off', async () => {
            const { service, userModel } = buildService({
                organizationLibraryEnabled: false,
            });
            userModel.findSessionUserAndOrgByUuid.mockResolvedValue(
                makeUser('admin'),
            );

            await expect(authorize(service)).rejects.toThrow(
                'The organization library is turned off',
            );
        });
    });
});
