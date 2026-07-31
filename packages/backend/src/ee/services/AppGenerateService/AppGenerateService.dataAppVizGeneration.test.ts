// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import {
    DATA_APP_VIZ_TEMPLATE,
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

const USER = { userUuid: 'user-1', organizationUuid: 'org-1' } as never;

function buildService(
    overrides: {
        appModel?: Record<string, unknown>;
        schedulerClient?: Record<string, unknown>;
    } = {},
) {
    const analytics = { track: vi.fn() };
    const appModel = overrides.appModel ?? {
        createWithVersion: vi.fn().mockResolvedValue(undefined),
        createVersion: vi.fn().mockResolvedValue(undefined),
        getApp: vi.fn().mockResolvedValue({
            app_id: 'app-1',
            project_uuid: 'project-1',
            organization_uuid: 'org-1',
            created_by_user_uuid: 'user-1',
            space_uuid: null,
            design_uuid: null,
        }),
        getLatestVersion: vi.fn().mockResolvedValue({
            version: 1,
            status: 'ready',
            dependencies: null,
            created_at: new Date(),
        }),
    };
    const schedulerClient = overrides.schedulerClient ?? {
        appGeneratePipeline: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AppGenerateService({
        lightdashConfig: {
            appRuntime: { sampleDataEnabled: true },
        } as never,
        analytics: analytics as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {
            getDefault: vi.fn().mockResolvedValue(null),
        } as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-1' }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            // generateApp resolves the Claude model through this; null means
            // the org has no Data App model restrictions.
            getDataAppModelVisibility: async () => null,
        } as never,
    });
    // Bypass real CASL — the mapping/flow is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ cannot: () => false });
    return { service, appModel, schedulerClient, analytics };
}

describe('AppGenerateService.generateApp with the data app viz template', () => {
    it('persists the viz template so the pipeline builds a data app viz', async () => {
        const { service, appModel, schedulerClient, analytics } =
            buildService();

        const result = await service.generateApp(
            USER,
            'project-1',
            'a radial gauge',
            [], // imageIds
            undefined, // preGeneratedAppUuid
            undefined, // charts
            undefined, // dashboard
            DATA_APP_VIZ_TEMPLATE,
            undefined, // clarifications
            undefined, // spaceUuid
            undefined, // claudeModelInput
            { creationExperience: 'explorer_chart_config' },
        );

        expect(result).toEqual({
            appUuid: expect.any(String),
            version: 1,
        });

        const createCall = (
            appModel.createWithVersion as ReturnType<typeof vi.fn>
        ).mock.calls[0];
        expect(createCall[0]).toMatchObject({
            app_id: result.appUuid,
            project_uuid: 'project-1',
            created_by_user_uuid: 'user-1',
            template: DATA_APP_VIZ_TEMPLATE,
            space_uuid: null,
        });
        expect(createCall[2]).toBe('pending');
        expect(createCall[3]).toMatchObject({
            creationExperience: 'explorer_chart_config',
        });

        // The pipeline switches on the app's stored template to build a data
        // app viz — no separate endpoint or flag needed.
        const enqueueCall = (
            schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>
        ).mock.calls[0][0];
        expect(enqueueCall).toMatchObject({
            appUuid: result.appUuid,
            version: 1,
            projectUuid: 'project-1',
            isIteration: false,
            template: DATA_APP_VIZ_TEMPLATE,
            creationExperience: 'explorer_chart_config',
        });

        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.created',
                properties: expect.objectContaining({
                    creationExperience: 'explorer_chart_config',
                }),
            }),
        );
    });

    it('does not misclassify older callers with no experience', async () => {
        const { service, appModel, schedulerClient, analytics } =
            buildService();

        await service.generateApp(
            USER,
            'project-1',
            'Build a visualization',
            [],
            'app-1',
            undefined,
            undefined,
            DATA_APP_VIZ_TEMPLATE,
        );

        const createCall = (
            appModel.createWithVersion as ReturnType<typeof vi.fn>
        ).mock.calls[0];
        expect(createCall[3]).not.toHaveProperty('creationExperience');
        expect(
            (schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>)
                .mock.calls[0][0],
        ).not.toHaveProperty('creationExperience');
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.created',
                properties: expect.objectContaining({
                    creationExperience: null,
                }),
            }),
        );
    });
});

describe('AppGenerateService.iterateApp creation experience', () => {
    it('persists the experience that submitted this version', async () => {
        const { service, appModel, schedulerClient, analytics } =
            buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'make the bars teal',
            [],
            undefined,
            undefined,
            undefined,
            { creationExperience: 'explorer_chart_config' },
        );

        const createCall = (appModel.createVersion as ReturnType<typeof vi.fn>)
            .mock.calls[0];
        expect(createCall[4]).toMatchObject({
            creationExperience: 'explorer_chart_config',
        });
        expect(
            (schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>)
                .mock.calls[0][0],
        ).toMatchObject({
            version: 2,
            creationExperience: 'explorer_chart_config',
        });
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.iterated',
                properties: expect.objectContaining({
                    version: 2,
                    creationExperience: 'explorer_chart_config',
                }),
            }),
        );
    });

    it('does not misclassify an older iteration caller', async () => {
        const { service, appModel, schedulerClient, analytics } =
            buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'make the bars teal',
            [],
        );

        const createCall = (appModel.createVersion as ReturnType<typeof vi.fn>)
            .mock.calls[0];
        expect(createCall[4]).not.toHaveProperty('creationExperience');
        expect(
            (schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>)
                .mock.calls[0][0],
        ).not.toHaveProperty('creationExperience');
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.iterated',
                properties: expect.objectContaining({
                    version: 2,
                    creationExperience: null,
                }),
            }),
        );
    });
});

describe('AppGenerateService.parseSchema', () => {
    const validSchema: DataAppVizSchema = {
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

    it('validates a well-formed schema', () => {
        expect(AppGenerateService.parseSchema(validSchema)).toEqual(
            validSchema,
        );
    });

    it('defaults configOptions to [] and colorPalette to null when omitted', () => {
        expect(
            AppGenerateService.parseSchema({ fields: validSchema.fields }),
        ).toEqual(validSchema);
    });

    it('returns null for a non-object value', () => {
        expect(AppGenerateService.parseSchema('nope')).toBeNull();
        expect(AppGenerateService.parseSchema(null)).toBeNull();
    });

    it('returns null for a structurally invalid schema', () => {
        expect(
            AppGenerateService.parseSchema({
                fields: [
                    { name: 'x', label: 'X', type: 'nope', required: true },
                ],
            }),
        ).toBeNull();
    });

    it('returns null for duplicate field names', () => {
        expect(
            AppGenerateService.parseSchema({
                fields: [
                    {
                        name: 'a',
                        label: 'A',
                        type: 'dimension',
                        required: true,
                    },
                    { name: 'a', label: 'A2', type: 'metric', required: false },
                ],
            }),
        ).toBeNull();
    });
});
