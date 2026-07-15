// Stub the e2b/ai SDKs so the tests never reach a real sandbox or model client.
import {
    DATA_APP_VIZ_TEMPLATE,
    NotFoundError,
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
};

const makeDataAppVizRow = (overrides: Record<string, unknown> = {}) => ({
    app_id: 'data-app-viz-1',
    name: 'Radial gauge',
    description: 'A radial gauge renderer',
    project_uuid: 'project-1',
    space_uuid: null,
    sandbox_id: null,
    template: DATA_APP_VIZ_TEMPLATE,
    viz_schema: vizSchema,
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

function buildService(appModel: unknown) {
    const service = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-1' }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });
    // Bypass real CASL — the mapping/flow is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({
        can: () => true,
        cannot: () => false,
    });
    return service;
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
        );
        expect(result).toEqual({
            data: [
                {
                    dataAppVizUuid: 'data-app-viz-1',
                    name: 'Radial gauge',
                    description: 'A radial gauge renderer',
                    projectUuid: 'project-1',
                    spaceUuid: null,
                    schema: vizSchema,
                    createdAt: new Date('2026-06-30'),
                    createdByUserUuid: 'user-1',
                },
            ],
            pagination,
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
            ...overrides,
        });
        const appModel = {
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
