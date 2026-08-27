import { NotFoundError } from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

const USER = { userUuid: 'user-1', organizationUuid: 'org-1' } as never;
const PROJECT_UUID = 'project-1';

const makeApp = (overrides: Record<string, unknown> = {}) => ({
    app_id: 'app-1',
    slug: 'revenue-app',
    name: 'Revenue app',
    description: 'Revenue by region',
    project_uuid: PROJECT_UUID,
    organization_uuid: 'org-1',
    space_uuid: null,
    template: 'dashboard',
    created_by_user_uuid: 'user-1',
    upstream_app_uuid: 'upstream-1',
    views_count: 4,
    ...overrides,
});

const readyVersion = {
    version: 2,
    status: 'ready',
    status_message: null,
    error: null,
    resources: {
        images: [],
        charts: [],
        dashboardName: null,
        clarifications: [],
    },
    data_references: {
        extractorVersion: 4,
        references: [],
        parseErrors: [],
        stats: {
            callSites: 0,
            fullyResolved: 0,
            partiallyResolved: 0,
            unresolved: 0,
        },
    },
};

const buildService = ({
    app = makeApp(),
    latestVersion = readyVersion,
    latestReadyVersion = readyVersion,
}: {
    app?: ReturnType<typeof makeApp>;
    latestVersion?: typeof readyVersion | null;
    latestReadyVersion?: typeof readyVersion | null;
} = {}) => {
    const service = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: {
            getApp: vi.fn().mockResolvedValue(app),
            getLatestVersion: vi.fn().mockResolvedValue(latestVersion),
            getLatestReadyVersion: vi
                .fn()
                .mockResolvedValue(latestReadyVersion),
            getVersion: vi.fn().mockResolvedValue(latestReadyVersion),
        } as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                projectUuid: PROJECT_UUID,
                type: 'DEFAULT',
                createdByUserUuid: null,
                upstreamProjectUuid: null,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {
            getSpaceSummary: vi
                .fn()
                .mockResolvedValue({ uuid: 'space-1', name: 'Finance' }),
        } as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            getSpaceAccessContext: vi.fn().mockResolvedValue({}),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            listAppLinks: vi.fn().mockResolvedValue([
                {
                    alias: 'weather',
                    connection: { origin: 'https://api.weather.example' },
                },
            ]),
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });
    // Personal-app rule only: the creator can view their own spaceless app.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({
        can: (
            _action: string,
            subject: { createdByUserUuid: string; spaceUuid?: string },
        ) => subject.createdByUserUuid === 'user-1',
        cannot: () => false,
    });
    return service;
};

describe('AppGenerateService.getDataAppReadSource', () => {
    it('assembles the read source for a viewable app', async () => {
        const service = buildService({
            latestVersion: { ...readyVersion, version: 3, status: 'building' },
        });

        const source = await service.getDataAppReadSource(
            USER,
            PROJECT_UUID,
            'app-1',
        );

        expect(source.app).toEqual({
            uuid: 'app-1',
            slug: 'revenue-app',
            name: 'Revenue app',
            description: 'Revenue by region',
            template: 'dashboard',
            space: null,
            views: 4,
            createdByUserUuid: 'user-1',
            upstreamAppUuid: 'upstream-1',
        });
        expect(source.latestVersion).toEqual({
            version: 3,
            status: 'building',
            statusMessage: null,
            error: null,
        });
        expect(source.latestReadyVersion).toEqual({
            version: 2,
            resources: readyVersion.resources,
        });
        expect(source.dataReferences).toEqual(readyVersion.data_references);
        expect(source.externalConnections).toEqual([
            { alias: 'weather', origin: 'https://api.weather.example' },
        ]);
        expect(source).not.toHaveProperty('files');
    });

    it("reads another user's personal app as not found, never forbidden", async () => {
        const service = buildService({
            app: makeApp({ created_by_user_uuid: 'someone-else' }),
        });

        await expect(
            service.getDataAppReadSource(USER, PROJECT_UUID, 'app-1'),
        ).rejects.toThrow(NotFoundError);
    });

    it('reads a data app viz as not found', async () => {
        const service = buildService({
            app: makeApp({ template: 'data_app_viz' }),
        });

        await expect(
            service.getDataAppReadSource(USER, PROJECT_UUID, 'app-1'),
        ).rejects.toThrow(NotFoundError);
    });

    it('reads an app with no ready version without data references', async () => {
        const service = buildService({
            latestVersion: { ...readyVersion, version: 1, status: 'error' },
            latestReadyVersion: null,
        });

        const source = await service.getDataAppReadSource(
            USER,
            PROJECT_UUID,
            'app-1',
        );

        expect(source.latestReadyVersion).toBeNull();
        expect(source.dataReferences).toBeNull();
    });
});
