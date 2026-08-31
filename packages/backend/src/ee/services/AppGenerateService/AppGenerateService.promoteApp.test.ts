import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));

const PREVIEW_PROJECT_UUID = 'preview-project';
const PRODUCTION_PROJECT_UUID = 'production-project';
const ORGANIZATION_UUID = 'organization';
const USER_UUID = 'user';
const PREVIEW_APP_UUID = 'preview-app';
const PRODUCTION_APP_UUID = 'production-app';
const STALE_SANDBOX_UUID = 'stale-sandbox';

const previewApp = {
    app_id: PREVIEW_APP_UUID,
    project_uuid: PREVIEW_PROJECT_UUID,
    organization_uuid: ORGANIZATION_UUID,
    space_uuid: null,
    design_uuid: null,
    sandbox_id: 'preview-sandbox',
    upstream_app_uuid: PRODUCTION_APP_UUID,
    template: 'data_app',
    name: 'Revenue app',
    slug: 'revenue-app',
    description: null,
    created_by_user_uuid: USER_UUID,
    deleted_at: null,
    deleted_by_user_uuid: null,
};

const sourceVersion = {
    app_version_id: 'preview-version',
    app_id: PREVIEW_APP_UUID,
    version: 3,
    prompt: 'Fix currency formatting',
    status: 'ready' as const,
    error: null,
    resources: null,
    dependencies: null,
    viz_schema: null,
    data_references: null,
};

function buildService(destroy: () => Promise<void>) {
    const productionApp = {
        ...previewApp,
        app_id: PRODUCTION_APP_UUID,
        project_uuid: PRODUCTION_PROJECT_UUID,
        sandbox_id: STALE_SANDBOX_UUID as string | null,
    };
    const appModel = {
        getApp: vi.fn().mockResolvedValue(previewApp),
        getLatestReadyVersion: vi.fn().mockResolvedValue(sourceVersion),
        getLatestVersion: vi.fn().mockResolvedValue({ version: 6 }),
        createVersion: vi.fn().mockResolvedValue({ version: 7 }),
        syncPromotedApp: vi.fn().mockResolvedValue(undefined),
        updateStatusMessage: vi.fn().mockResolvedValue(undefined),
        updateVersionDataReferences: vi.fn().mockResolvedValue(undefined),
        updateSandboxUuid: vi
            .fn()
            .mockImplementation(
                async (_appUuid: string, sandboxUuid: string | null) => {
                    productionApp.sandbox_id = sandboxUuid;
                },
            ),
    };
    const manager = { destroy: vi.fn(destroy) };
    const service = new AppGenerateService({
        lightdashConfig: { appRuntime: {} } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {
            findInOrganization: vi.fn().mockResolvedValue(null),
        } as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PREVIEW_PROJECT_UUID,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PREVIEW_PROJECT_UUID,
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
                directOnly: false,
            }),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            listAppLinks: vi.fn().mockResolvedValue([]),
            replaceAppLinks: vi.fn().mockResolvedValue(undefined),
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });
    vi.spyOn(
        service as unknown as {
            getUpstreamProjectForPromotion: () => Promise<unknown>;
        },
        'getUpstreamProjectForPromotion',
    ).mockResolvedValue({
        upstreamProjectUuid: PRODUCTION_PROJECT_UUID,
        upstreamProjectName: 'Production',
        upstreamOrganizationUuid: ORGANIZATION_UUID,
    });
    vi.spyOn(
        service as unknown as {
            findLinkedUpstreamApp: () => Promise<unknown>;
        },
        'findLinkedUpstreamApp',
    ).mockResolvedValue(productionApp);
    vi.spyOn(
        service as unknown as { getS3Client: () => unknown },
        'getS3Client',
    ).mockReturnValue({
        client: { send: vi.fn().mockResolvedValue({}) },
        bucket: 'test-bucket',
    });
    vi.spyOn(
        AppGenerateService as unknown as {
            copyVersionS3Prefix: () => Promise<string[]>;
        },
        'copyVersionS3Prefix',
    ).mockResolvedValue([]);
    vi.spyOn(
        service as unknown as { getSandboxManager: () => unknown },
        'getSandboxManager',
    ).mockReturnValue(manager);

    return { service, productionApp, manager };
}

describe('promoteApp sandbox state', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('invalidates the existing production sandbox', async () => {
        const { service, productionApp, manager } = buildService(
            async () => {},
        );

        await service.promoteApp(
            {
                userUuid: USER_UUID,
                organizationUuid: ORGANIZATION_UUID,
            } as never,
            PREVIEW_PROJECT_UUID,
            PREVIEW_APP_UUID,
        );

        expect(productionApp.sandbox_id).toBeNull();
        expect(manager.destroy).toHaveBeenCalledWith({
            sandboxUuid: STALE_SANDBOX_UUID,
        });
    });

    it('clears sandbox state when provider cleanup fails', async () => {
        const { service, productionApp } = buildService(async () => {
            throw new Error('provider unavailable');
        });

        await service.promoteApp(
            {
                userUuid: USER_UUID,
                organizationUuid: ORGANIZATION_UUID,
            } as never,
            PREVIEW_PROJECT_UUID,
            PREVIEW_APP_UUID,
        );

        expect(productionApp.sandbox_id).toBeNull();
    });
});
