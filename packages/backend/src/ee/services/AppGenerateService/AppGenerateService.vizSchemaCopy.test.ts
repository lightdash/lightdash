// Every path that snapshots an app version into a new one must carry the
// version's viz_schema — it exists only in the database (generation structured
// output), so a copy that drops it produces a data app viz that never appears
// in the viz picker.
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));
vi.mock('./appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue(undefined),
}));

const PROJECT_UUID = 'proj-uuid-1';
const UPSTREAM_PROJECT_UUID = 'proj-uuid-upstream';
const PREVIEW_PROJECT_UUID = 'proj-uuid-preview';
const ORG_UUID = 'org-uuid-1';
const USER_UUID = 'user-uuid-1';
const SOURCE_APP_UUID = 'source-app-uuid';
const UPSTREAM_APP_UUID = 'upstream-app-uuid';

const VIZ_SCHEMA = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension' as const,
            required: true,
        },
        {
            name: 'value',
            label: 'Value',
            type: 'metric' as const,
            required: true,
        },
    ],
    configOptions: [],
};

const sourceApp = {
    app_id: SOURCE_APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    space_uuid: null,
    design_uuid: null,
    sandbox_id: null,
    upstream_app_uuid: null,
    template: 'data_app_viz',
    name: 'My Viz',
    description: 'A viz',
    created_by_user_uuid: USER_UUID,
    deleted_at: null,
    deleted_by_user_uuid: null,
};

const sourceVersion = {
    app_version_id: 'version-id',
    app_id: SOURCE_APP_UUID,
    version: 3,
    prompt: 'Build a viz',
    status: 'ready' as const,
    error: null,
    resources: null,
    dependencies: null,
    viz_schema: VIZ_SCHEMA,
};

const makeUser = () =>
    ({
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
    }) as never;

function buildService() {
    const appModel = {
        getApp: vi.fn().mockResolvedValue(sourceApp),
        getLatestReadyVersion: vi.fn().mockResolvedValue(sourceVersion),
        getLatestVersion: vi.fn().mockResolvedValue({ version: 6 }),
        createWithVersion: vi.fn().mockResolvedValue({
            app: { app_id: 'new-app-uuid' },
            version: { version: 1 },
        }),
        createVersion: vi.fn().mockResolvedValue({ version: 7 }),
        setUpstreamAppUuid: vi.fn().mockResolvedValue(undefined),
        syncPromotedApp: vi.fn().mockResolvedValue(undefined),
        updateStatusMessage: vi.fn().mockResolvedValue(undefined),
        listAppsByProject: vi.fn().mockResolvedValue([sourceApp]),
        remapPreviewDashboardTileApps: vi.fn().mockResolvedValue(undefined),
    };

    const externalConnectionModel = {
        listAppLinks: vi.fn().mockResolvedValue([]),
        copyConnectionsToProject: vi.fn().mockResolvedValue(new Map()),
        linkToApp: vi.fn().mockResolvedValue(undefined),
    };

    const organizationDesignModel = {
        findInOrganization: vi.fn().mockResolvedValue(null),
    };

    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: ORG_UUID,
            projectUuid: PREVIEW_PROJECT_UUID,
        }),
    };

    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };

    const service = new AppGenerateService({
        lightdashConfig: {
            appRuntime: { customDependenciesEnabled: true },
        } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: featureFlagModel as never,
        organizationDesignModel: organizationDesignModel as never,
        pinnedListModel: {} as never,
        projectModel: projectModel as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            getSpaceAccessContext: vi.fn().mockResolvedValue({}),
        } as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: externalConnectionModel as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });

    vi.spyOn(
        service as unknown as { getS3Client: () => unknown },
        'getS3Client',
    ).mockReturnValue({
        client: { send: vi.fn().mockResolvedValue({}) },
        bucket: 'test-bucket',
    });

    return { service, appModel };
}

describe('viz_schema propagation on app copy paths', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(
            AppGenerateService as unknown as {
                copyVersionS3Prefix: () => Promise<string[]>;
            },
            'copyVersionS3Prefix',
        ).mockResolvedValue([]);
    });

    it('duplicateApp copies the source version viz_schema onto the new v1', async () => {
        const { service, appModel } = buildService();

        await service.duplicateApp(makeUser(), PROJECT_UUID, SOURCE_APP_UUID);

        expect(appModel.createWithVersion).toHaveBeenCalledWith(
            expect.objectContaining({ template: 'data_app_viz' }),
            expect.anything(),
            'ready',
            expect.any(Object),
            undefined, // no declared dependencies
            VIZ_SCHEMA,
        );
    });

    it('promoteApp (first promotion) copies viz_schema onto the new production app', async () => {
        const { service, appModel } = buildService();

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
        vi.spyOn(
            service as unknown as {
                findLinkedUpstreamApp: () => Promise<unknown>;
            },
            'findLinkedUpstreamApp',
        ).mockResolvedValue(null);

        await service.promoteApp(makeUser(), PROJECT_UUID, SOURCE_APP_UUID);

        expect(appModel.createWithVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                project_uuid: UPSTREAM_PROJECT_UUID,
                template: 'data_app_viz',
            }),
            expect.anything(),
            'ready',
            expect.any(Object),
            undefined, // no declared dependencies
            VIZ_SCHEMA,
        );
    });

    it('promoteApp (follow-up promotion) copies viz_schema onto the appended version', async () => {
        const { service, appModel } = buildService();

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
        vi.spyOn(
            service as unknown as {
                findLinkedUpstreamApp: () => Promise<unknown>;
            },
            'findLinkedUpstreamApp',
        ).mockResolvedValue({
            app_id: UPSTREAM_APP_UUID,
            project_uuid: UPSTREAM_PROJECT_UUID,
        });

        await service.promoteApp(makeUser(), PROJECT_UUID, SOURCE_APP_UUID);

        expect(appModel.createVersion).toHaveBeenCalledWith(
            UPSTREAM_APP_UUID,
            { version: 7, prompt: expect.any(String) },
            'ready',
            USER_UUID,
            expect.any(Object),
            undefined, // no declared dependencies
            VIZ_SCHEMA,
        );
    });

    it('duplicateAppsForPreview copies viz_schema onto the preview copy', async () => {
        const { service, appModel } = buildService();

        await service.duplicateAppsForPreview(
            PROJECT_UUID,
            PREVIEW_PROJECT_UUID,
            [],
        );

        expect(appModel.createWithVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                project_uuid: PREVIEW_PROJECT_UUID,
                template: 'data_app_viz',
            }),
            expect.anything(),
            'ready',
            expect.any(Object),
            undefined, // no declared dependencies
            VIZ_SCHEMA,
        );
    });
});
