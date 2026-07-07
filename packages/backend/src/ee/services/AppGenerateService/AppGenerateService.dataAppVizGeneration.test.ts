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
    const appModel = overrides.appModel ?? {
        createWithVersion: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = overrides.schedulerClient ?? {
        appGeneratePipeline: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
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
        orgAiCopilotConfigResolver: {} as never,
    });
    // Bypass real CASL — the mapping/flow is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ cannot: () => false });
    return { service, appModel, schedulerClient };
}

describe('AppGenerateService.generateApp with the data app viz template', () => {
    it('persists the viz template so the pipeline builds a data app viz', async () => {
        const { service, appModel, schedulerClient } = buildService();

        const result = await service.generateApp(
            USER,
            'project-1',
            'a radial gauge',
            [], // imageIds
            undefined, // preGeneratedAppUuid
            undefined, // charts
            undefined, // dashboard
            DATA_APP_VIZ_TEMPLATE,
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
        });
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
    };

    it('validates a well-formed schema', () => {
        expect(AppGenerateService.parseSchema(validSchema)).toEqual(
            validSchema,
        );
    });

    it('defaults configOptions to [] when omitted', () => {
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
