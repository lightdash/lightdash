// Registry-installed chart types are read-only: content-mutating paths must
// reject them, while delete/restore/duplicate (fork) stay open.
import {
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    type ImportAppCodeRequestBody,
    type SessionUser,
} from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const PROJECT_UUID = 'project-uuid-1';
const ORG_UUID = 'org-uuid-1';
const USER_UUID = 'user-uuid-1';
const APP_UUID = 'app-uuid-1';
const UPSTREAM_PROJECT_UUID = 'project-uuid-upstream';
const UPSTREAM_APP_UUID = 'upstream-app-uuid';

const makeUser = (): SessionUser =>
    ({
        userId: 1,
        userUuid: USER_UUID,
        email: 'test@lightdash.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: ORG_UUID,
        organizationName: 'Test Org',
        organizationCreatedAt: new Date(),
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        avatarUrl: null,
        avatarGradient: null,
        isSetupComplete: true,
        role: OrganizationMemberRole.ADMIN,
        ability: { can: () => true, cannot: () => false } as never,
        abilityRules: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        timezone: null,
    }) as SessionUser;

// Base app shape shared by every fixture in this file.
const baseApp = {
    app_id: APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    space_uuid: null,
    design_uuid: null,
    sandbox_id: null,
    upstream_app_uuid: null,
    template: null,
    name: 'My Chart Type',
    slug: 'my-chart-type',
    description: 'A chart type',
    created_by_user_uuid: USER_UUID,
    deleted_at: null,
    deleted_by_user_uuid: null,
    registry_slug: null,
    registry_url: null,
    origin_app_uuid: null,
    origin_app_version: null,
};

// Registry-managed app fixture: installed from the official registry.
const registryApp = {
    ...baseApp,
    registry_slug: 'sankey',
    registry_url: 'https://charts.example.com',
};

function buildService(
    overrides: {
        appModel?: Record<string, unknown>;
        externalConnectionModel?: Record<string, unknown>;
        projectModel?: Record<string, unknown>;
        promoteService?: Record<string, unknown>;
    } = {},
) {
    const appModel = {
        getApp: vi.fn(),
        findApp: vi.fn(),
        findAppByUuid: vi.fn(),
        getLatestVersion: vi.fn().mockResolvedValue(null),
        getLatestReadyVersion: vi.fn().mockResolvedValue(null),
        getVersion: vi.fn().mockResolvedValue(null),
        createVersion: vi.fn().mockResolvedValue({ version: 1 }),
        createWithVersion: vi.fn().mockResolvedValue({
            app: { app_id: 'new-app-uuid' },
            version: { version: 1 },
        }),
        updateApp: vi.fn().mockResolvedValue({
            app_id: APP_UUID,
            name: 'x',
            description: 'y',
        }),
        updateStatusMessage: vi.fn().mockResolvedValue(undefined),
        updateVersionDataReferences: vi.fn().mockResolvedValue(undefined),
        countInProgressVersionsForProject: vi.fn().mockResolvedValue(0),
        softDelete: vi.fn().mockResolvedValue(undefined),
        ...overrides.appModel,
    };

    const externalConnectionModel = {
        listAppLinks: vi.fn().mockResolvedValue([]),
        findBySlug: vi.fn().mockResolvedValue(undefined),
        replaceAppLinks: vi.fn().mockResolvedValue(undefined),
        linkToApp: vi.fn().mockResolvedValue(undefined),
        ...overrides.externalConnectionModel,
    };

    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: ORG_UUID }),
        ...overrides.projectModel,
    };

    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };

    const promoteService = {
        getOrCreateUpstreamSpace: vi
            .fn()
            .mockResolvedValue('resolved-space-uuid'),
        ...overrides.promoteService,
    };

    const svc = new AppGenerateService({
        lightdashConfig: {
            softDelete: { enabled: true },
            appRuntime: {},
        } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: {
            findInOrganization: vi.fn().mockResolvedValue(null),
        } as never,
        pinnedListModel: {} as never,
        projectModel: projectModel as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({}),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: promoteService as never,
        externalConnectionModel: externalConnectionModel as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        chartRegistryClient: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
    });

    vi.spyOn(
        svc as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({
        can: () => true,
        cannot: () => false,
        rules: [],
    });

    vi.spyOn(
        svc as unknown as { getS3Client: () => unknown },
        'getS3Client',
    ).mockReturnValue({
        client: { send: vi.fn().mockResolvedValue({}) },
        bucket: 'test-bucket',
    });

    return {
        service: svc,
        appModel,
        externalConnectionModel,
        projectModel,
        promoteService,
    };
}

describe('read-only invariant for registry-managed apps', () => {
    beforeEach(() => {
        vi.spyOn(
            AppGenerateService as unknown as {
                copyVersionS3Prefix: () => Promise<string[]>;
            },
            'copyVersionS3Prefix',
        ).mockResolvedValue([]);
    });

    it('iterateApp throws ForbiddenError', async () => {
        const { service, appModel } = buildService();
        appModel.getApp.mockResolvedValue(registryApp);

        await expect(
            service.iterateApp(
                makeUser(),
                PROJECT_UUID,
                APP_UUID,
                'Add a bar chart',
                [],
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('upgradeApp throws ForbiddenError', async () => {
        const { service, appModel } = buildService();
        appModel.getApp.mockResolvedValue(registryApp);

        await expect(
            service.upgradeApp(makeUser(), PROJECT_UUID, APP_UUID, {}),
        ).rejects.toThrow(ForbiddenError);
    });

    it('updateApp (rename) throws ForbiddenError', async () => {
        const { service, appModel } = buildService();
        appModel.getApp.mockResolvedValue(registryApp);

        await expect(
            service.updateApp(makeUser(), PROJECT_UUID, APP_UUID, {
                name: 'New name',
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('importAppCode append targeting a registry app throws ForbiddenError', async () => {
        const { service, appModel } = buildService();
        appModel.findApp.mockResolvedValue(registryApp);

        const body: ImportAppCodeRequestBody = {
            code: {
                manifest: {
                    codeVersion: 1,
                    version: 1,
                    name: 'Test App',
                    description: 'A test app',
                    template: null,
                    downloadedAt: new Date().toISOString(),
                },
                files: [
                    {
                        path: 'src/App.tsx',
                        contentBase64: Buffer.from('hi').toString('base64'),
                    },
                ],
            },
            targetAppUuid: APP_UUID,
            force: true,
        };

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, body),
        ).rejects.toThrow(ForbiddenError);
    });

    it('importAppCode identical-bundle upload targeting a registry app throws ForbiddenError before any metadata patch', async () => {
        const { service, appModel } = buildService();
        appModel.findApp.mockResolvedValue(registryApp);
        const updateAppMetadataIfChangedSpy = vi.spyOn(
            service as unknown as {
                updateAppMetadataIfChanged: () => Promise<void>;
            },
            'updateAppMetadataIfChanged',
        );

        const body: ImportAppCodeRequestBody = {
            code: {
                manifest: {
                    codeVersion: 1,
                    version: 1,
                    name: 'Test App',
                    description: 'A test app',
                    template: null,
                    downloadedAt: new Date().toISOString(),
                },
                files: [
                    {
                        path: 'src/App.tsx',
                        contentBase64: Buffer.from('hi').toString('base64'),
                    },
                ],
            },
            targetAppUuid: APP_UUID,
            // No `force` — this is the identical-bundle short-circuit path
            // that only patches metadata; it must still be blocked.
        };

        await expect(
            service.importAppCode(makeUser(), PROJECT_UUID, body),
        ).rejects.toThrow(ForbiddenError);
        expect(updateAppMetadataIfChangedSpy).not.toHaveBeenCalled();
        expect(appModel.updateApp).not.toHaveBeenCalled();
    });

    it('promoteApp onto a registry-managed upstream app throws ForbiddenError before creating the upstream space', async () => {
        const { service, appModel, promoteService } = buildService();
        const sourceApp = {
            ...baseApp,
            // A truthy space_uuid means, absent the fix, promoteApp would
            // call getOrCreateUpstreamSpace() — a persistent write — before
            // ever reaching the registry guard below.
            space_uuid: 'preview-space-uuid',
            upstream_app_uuid: UPSTREAM_APP_UUID,
        };
        const upstreamApp = {
            ...registryApp,
            app_id: UPSTREAM_APP_UUID,
            project_uuid: UPSTREAM_PROJECT_UUID,
        };
        appModel.getApp.mockResolvedValue(sourceApp);
        appModel.getLatestReadyVersion.mockResolvedValue({
            version: 1,
            resources: null,
            viz_schema: null,
            data_references: null,
        });
        appModel.findAppByUuid.mockResolvedValue(upstreamApp);

        vi.spyOn(
            service as unknown as {
                getUpstreamProjectForPromotion: () => Promise<unknown>;
            },
            'getUpstreamProjectForPromotion',
        ).mockResolvedValue({
            upstreamProjectUuid: UPSTREAM_PROJECT_UUID,
            upstreamProjectName: 'Production',
            upstreamOrganizationUuid: ORG_UUID,
        });

        await expect(
            service.promoteApp(makeUser(), PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(ForbiddenError);
        expect(promoteService.getOrCreateUpstreamSpace).not.toHaveBeenCalled();
        expect(appModel.getLatestReadyVersion).not.toHaveBeenCalled();
    });

    it('deleteApp is still allowed', async () => {
        const { service, appModel } = buildService();
        appModel.getApp.mockResolvedValue(registryApp);

        await expect(
            service.deleteApp(makeUser(), PROJECT_UUID, APP_UUID),
        ).resolves.toBeUndefined();
        expect(appModel.softDelete).toHaveBeenCalledWith(
            APP_UUID,
            PROJECT_UUID,
            USER_UUID,
        );
    });

    it('restoreVersion is still allowed and copies registry_version onto the new row', async () => {
        const { service, appModel } = buildService();
        appModel.getApp.mockResolvedValue(registryApp);
        appModel.getLatestVersion.mockResolvedValue({
            version: 2,
            status: 'ready',
        });
        appModel.getVersion.mockResolvedValue({
            version: 1,
            status: 'ready',
            resources: null,
            dependencies: null,
            viz_schema: null,
            data_references: null,
            registry_version: '1.1.0',
        });

        const result = await service.restoreVersion(
            makeUser(),
            PROJECT_UUID,
            APP_UUID,
            1,
        );

        expect(result).toEqual({ appUuid: APP_UUID, version: 3 });
        expect(appModel.createVersion).toHaveBeenCalledWith(
            APP_UUID,
            { version: 3, prompt: 'Restore version 1' },
            'ready',
            USER_UUID,
            undefined,
            undefined,
            undefined,
            { registryVersion: '1.1.0' },
        );
    });
});

describe('duplicateApp fork lineage', () => {
    beforeEach(() => {
        vi.spyOn(
            AppGenerateService as unknown as {
                copyVersionS3Prefix: () => Promise<string[]>;
            },
            'copyVersionS3Prefix',
        ).mockResolvedValue([]);
    });

    it('records origin_app_uuid + origin_app_version and honors the name option', async () => {
        const { service, appModel } = buildService();
        const sourceApp = { ...registryApp, name: 'Sankey' };
        appModel.getApp.mockResolvedValue(sourceApp);
        appModel.getLatestReadyVersion.mockResolvedValue({
            version: 4,
            resources: null,
            viz_schema: null,
            data_references: null,
        });

        await service.duplicateApp(makeUser(), PROJECT_UUID, APP_UUID, {
            name: 'Sankey (custom)',
        });

        expect(appModel.createWithVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Sankey (custom)',
                origin_app_uuid: APP_UUID,
                origin_app_version: 4,
            }),
            expect.anything(),
            'ready',
            expect.any(Object),
            undefined,
            undefined,
        );

        const [appArg] = appModel.createWithVersion.mock.calls[0] as [
            Record<string, unknown>,
        ];
        expect(appArg).not.toHaveProperty('registry_slug');
        expect(appArg).not.toHaveProperty('registry_url');
    });

    it('rejects an options.name longer than 255 characters', async () => {
        const { service, appModel } = buildService();
        const sourceApp = { ...baseApp, name: 'Sankey' };
        appModel.getApp.mockResolvedValue(sourceApp);
        appModel.getLatestReadyVersion.mockResolvedValue({
            version: 4,
            resources: null,
            viz_schema: null,
            data_references: null,
        });

        await expect(
            service.duplicateApp(makeUser(), PROJECT_UUID, APP_UUID, {
                name: 'a'.repeat(256),
            }),
        ).rejects.toThrow(ParameterError);
        expect(appModel.createWithVersion).not.toHaveBeenCalled();
    });
});
