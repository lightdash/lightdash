// Stub the e2b/ai SDKs so the tests never reach a real sandbox or model client.
import {
    DATA_APP_VIZ_TEMPLATE,
    ForbiddenError,
    getUserAbilityBuilder,
    OrganizationMemberRole,
    ParameterError,
    ProjectType,
    type DataAppVizPreviewSelectionInput,
    type DataAppVizSchema,
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

const USER = { userUuid: 'user-1' } as never;
const APP_UUID = 'chart-type-1';

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

const makeChartTypeRow = (overrides: Record<string, unknown> = {}) => ({
    app_id: APP_UUID,
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: 'A radial gauge renderer',
    project_uuid: 'project-1',
    space_uuid: null,
    sandbox_id: null,
    template: DATA_APP_VIZ_TEMPLATE,
    icon: null,
    viz_schema: vizSchema,
    design_uuid: null,
    data_app_viz_preview_selection: null,
    upstream_app_uuid: null,
    registry_slug: null,
    created_at: new Date('2026-06-30'),
    created_by_user_uuid: 'user-1',
    deleted_at: null,
    deleted_by_user_uuid: null,
    views_count: 0,
    search_vector: '',
    organization_uuid: 'org-1',
    ...overrides,
});

const validSelection: DataAppVizPreviewSelectionInput = {
    exploreName: 'orders',
    savedChart: null,
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [{ fieldId: 'orders_count', descending: true }],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: null,
        customDimensions: null,
    },
    fieldMapping: { category: 'orders_status', value: ['orders_count'] },
};

const storedSelection = (overrides: Record<string, unknown> = {}) => ({
    ...validSelection,
    version: 1,
    updatedAt: '2026-09-01T10:00:00.000Z',
    updatedByUserUuid: '33333333-3333-4333-8333-333333333333',
    ...overrides,
});

function buildService(appModel: unknown, { canManage = true } = {}) {
    const service = new AppGenerateService({
        lightdashConfig: { appRuntime: { s3: null } } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                type: ProjectType.DEFAULT,
                createdByUserUuid: 'user-1',
                upstreamProjectUuid: null,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                inheritsFromOrgOrProject: false,
                access: [],
            }),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
        } as never,
    });
    // Bypass real CASL — the write path and the mapping are what these cover.
    // `canManage: false` is a caller who may view the app but not edit it.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({
        can: (action: string) => canManage || action === 'view',
        cannot: (action: string) => !canManage && action !== 'view',
    });
    return service;
}

/** A service whose ability is the real thing, so the shipped rules apply. */
function buildServiceWithRealAbility(
    appModel: unknown,
    role: OrganizationMemberRole,
    userUuid: string,
) {
    const service = buildService(appModel);
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

const writeModel = (overrides: Record<string, unknown> = {}) => ({
    getApp: vi.fn().mockResolvedValue(makeChartTypeRow(overrides)),
    setDataAppVizPreviewSelection: vi.fn().mockResolvedValue(undefined),
});

const write = (service: AppGenerateService, selection: unknown, user = USER) =>
    service.setDataAppVizPreviewSelection(
        user,
        'project-1',
        APP_UUID,
        selection as DataAppVizPreviewSelectionInput,
    );

describe('remembering a preview data selection', () => {
    it('refuses an author who cannot manage the chart type', async () => {
        const appModel = writeModel({ created_by_user_uuid: 'someone-else' });
        const { service, user } = buildServiceWithRealAbility(
            appModel,
            OrganizationMemberRole.VIEWER,
            'viewer-1',
        );

        await expect(write(service, validSelection, user)).rejects.toThrow(
            ForbiddenError,
        );
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });

    it('rejects a selection that smuggles result rows', async () => {
        const appModel = writeModel();
        const service = buildService(appModel);

        await expect(
            write(service, {
                ...validSelection,
                rows: [{ orders_status: 'shipped', orders_count: 12 }],
            }),
        ).rejects.toThrow('Invalid preview data selection');
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });

    it('rejects result rows hidden inside the query shape', async () => {
        const appModel = writeModel();
        const service = buildService(appModel);

        await expect(
            write(service, {
                ...validSelection,
                metricQuery: {
                    ...validSelection.metricQuery,
                    rows: [{ orders_count: 12 }],
                },
            }),
        ).rejects.toThrow('Invalid preview data selection');
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });

    it('rejects any other key we did not ask for', async () => {
        const appModel = writeModel();
        const service = buildService(appModel);

        await expect(
            write(service, { ...validSelection, resultsCache: 'abc' }),
        ).rejects.toThrow('Invalid preview data selection');
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });

    it('rejects a selection larger than the cap', async () => {
        const appModel = writeModel();
        const service = buildService(appModel);

        await expect(
            write(service, {
                ...validSelection,
                metricQuery: {
                    ...validSelection.metricQuery,
                    filters: { dimensions: { blob: 'x'.repeat(70 * 1024) } },
                },
            }),
        ).rejects.toThrow('too large to remember');
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });

    it('stamps the version, time and author itself, ignoring the body', async () => {
        const appModel = writeModel();
        const service = buildService(appModel);
        const before = new Date();

        await write(service, {
            ...validSelection,
            version: 99,
            updatedAt: new Date('2000-01-01'),
            updatedByUserUuid: 'someone-else',
        });

        expect(appModel.setDataAppVizPreviewSelection).toHaveBeenCalledOnce();
        const [appUuid, projectUuid, stored] =
            appModel.setDataAppVizPreviewSelection.mock.calls[0];
        expect(appUuid).toBe(APP_UUID);
        expect(projectUuid).toBe('project-1');
        expect(stored.version).toBe(1);
        expect(stored.updatedByUserUuid).toBe('user-1');
        expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(
            before.getTime(),
        );
        expect(stored.fieldMapping).toEqual(validSelection.fieldMapping);
        expect(Object.keys(stored).sort()).toEqual([
            'exploreName',
            'fieldMapping',
            'metricQuery',
            'savedChart',
            'updatedAt',
            'updatedByUserUuid',
            'version',
        ]);
    });

    it('refuses a registry-installed chart type', async () => {
        const appModel = writeModel({ registry_slug: 'official/gauge' });
        const service = buildService(appModel);

        await expect(write(service, validSelection)).rejects.toThrow(
            ForbiddenError,
        );
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });

    it('refuses an app that is not a chart type', async () => {
        const appModel = writeModel({ template: null });
        const service = buildService(appModel);

        await expect(write(service, validSelection)).rejects.toThrow(
            ParameterError,
        );
        expect(appModel.setDataAppVizPreviewSelection).not.toHaveBeenCalled();
    });
});

describe('reading a preview data selection back', () => {
    const appModelWith = (stored: unknown) => ({
        getAppByUuidOrSlug: vi.fn().mockResolvedValue({ app_id: APP_UUID }),
        getAppWithVersions: vi.fn().mockResolvedValue({
            name: 'Radial gauge',
            description: '',
            icon: null,
            createdByUserUuid: 'user-1',
            organizationUuid: 'org-1',
            spaceUuid: null,
            spaceName: null,
            template: DATA_APP_VIZ_TEMPLATE,
            pinnedListUuid: null,
            pinnedListOrder: null,
            slug: 'radial-gauge',
            viewsCount: 0,
            currentThread: {
                app_thread_uuid: 'thread-1',
                thread_number: 1,
                created_at: new Date('2026-06-30'),
            },
            versions: [],
            hasMore: false,
            registrySlug: null,
            previewSelection: stored,
        }),
        getLatestReadyVersion: vi.fn().mockResolvedValue(null),
    });

    it('serves the whole selection to a caller who can manage the app', async () => {
        const service = buildService(appModelWith(storedSelection()));

        const result = await service.getAppVersions(
            USER,
            'project-1',
            APP_UUID,
            {},
        );

        expect(result.previewSelection).toMatchObject({
            version: 1,
            exploreName: 'orders',
            fieldMapping: validSelection.fieldMapping,
        });
        expect(result.previewSelection?.updatedAt).toEqual(
            new Date('2026-09-01T10:00:00.000Z'),
        );
    });

    it('serves null to a caller who can only view the app', async () => {
        const service = buildService(appModelWith(storedSelection()), {
            canManage: false,
        });

        const result = await service.getAppVersions(
            USER,
            'project-1',
            APP_UUID,
            {},
        );

        expect(result.previewSelection).toBeNull();
    });

    it.each([
        ['corrupt json', { exploreName: 42 }],
        [
            'a version this server does not know',
            storedSelection({ version: 2 }),
        ],
        ['nothing stored', null],
    ])('serves null for %s', async (_label, stored) => {
        const service = buildService(appModelWith(stored));

        const result = await service.getAppVersions(
            USER,
            'project-1',
            APP_UUID,
            {},
        );

        expect(result.previewSelection).toBeNull();
    });
});

describe('payloads that must never carry a preview selection', () => {
    const withSelection = makeChartTypeRow({
        data_app_viz_preview_selection: storedSelection(),
    });

    it('keeps it out of the render metadata', async () => {
        const version = {
            app_version_id: 'app-version-1',
            app_id: APP_UUID,
            version: 1,
            status: 'ready',
            viz_schema: vizSchema,
            created_at: new Date('2026-06-30'),
        };
        const service = buildService({
            findVisualizationApp: vi.fn().mockResolvedValue(withSelection),
            getLatestVersion: vi.fn().mockResolvedValue(version),
            getLatestRenderableDataAppVizVersion: vi
                .fn()
                .mockResolvedValue(version),
        });

        const metadata = await service.getDataAppVizRenderMetadata(
            USER,
            'project-1',
            APP_UUID,
        );

        expect(Object.keys(metadata)).not.toContain('previewSelection');
        expect(JSON.stringify(metadata)).not.toContain('orders_status');
    });

    it('keeps it out of the embed/CLI app listing', async () => {
        const service = buildService({
            listAppsByProject: vi.fn().mockResolvedValue([withSelection]),
        });

        const apps = await service.listAppsForProject(USER, 'project-1');

        expect(apps).toEqual([
            {
                appUuid: APP_UUID,
                name: 'Radial gauge',
                slug: 'radial-gauge',
                template: DATA_APP_VIZ_TEMPLATE,
            },
        ]);
    });
});
