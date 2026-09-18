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
        codingAgent?: 'claude' | 'codex';
        sampleDataEnabled?: boolean;
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
            registry_slug: null,
            template: DATA_APP_VIZ_TEMPLATE,
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
            appRuntime: {
                sampleDataEnabled: overrides.sampleDataEnabled ?? true,
                dataAppCodingAgent: overrides.codingAgent,
            },
        } as never,
        analytics: analytics as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
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
        savedChartModel: {} as never,
        schedulerClient: schedulerClient as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
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
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            // generateApp resolves the Claude model through this; null means
            // the org has no Data App model restrictions.
            getDataAppModelVisibility: async () => null,
        } as never,
        sandboxManager: null,
        appRuntimeS3: null,
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
    });
    // Bypass real CASL — the mapping/flow is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ can: () => true, cannot: () => false });
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
            { name: null, creationExperience: 'explorer_chart_config' },
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

    it('tracks the selected Codex model without a fake Claude model', async () => {
        const { service, analytics } = buildService({ codingAgent: 'codex' });

        await service.generateApp(
            USER,
            'project-1',
            'Build a visualization',
            [],
            'app-1',
            undefined,
            undefined,
            DATA_APP_VIZ_TEMPLATE,
            undefined,
            undefined,
            undefined,
            { name: null, codexModelInput: 'gpt-5.6-sol' },
        );

        const event = analytics.track.mock.calls[0][0];
        expect(event).toMatchObject({
            event: 'data_app.created',
            properties: {
                codingAgent: 'codex',
                codingAgentModel: 'gpt-5.6-sol',
            },
        });
        expect(event.properties).not.toHaveProperty('claudeModel');
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

    it('forwards the AI-agent tool call correlation to the pipeline', async () => {
        const { service, schedulerClient } = buildService();

        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'make the bars teal',
            [],
            undefined,
            undefined,
            undefined,
            {
                creationExperience: 'ai_agent',
                aiAgentToolCall: {
                    promptUuid: 'prompt-1',
                    toolCallId: 'tool-call-1',
                },
            },
        );

        expect(
            (schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>)
                .mock.calls[0][0],
        ).toMatchObject({
            isIteration: true,
            aiAgentToolCall: {
                promptUuid: 'prompt-1',
                toolCallId: 'tool-call-1',
            },
        });
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

describe('AppGenerateService chart build context', () => {
    const schema: DataAppVizSchema = {
        fields: [
            { name: 'amount', label: 'Amount', type: 'metric', required: true },
        ],
        configOptions: [],
        colorPalette: null,
    };

    it('sends context to a new chart build while persisting only the user prompt', async () => {
        const { service, appModel, schedulerClient } = buildService();
        await service.generateApp(
            USER,
            'project-1',
            'Make the bars teal',
            [],
            'app-1',
            undefined,
            undefined,
            DATA_APP_VIZ_TEMPLATE,
            undefined,
            undefined,
            undefined,
            {
                name: null,
                vizContext: {
                    schema,
                    fieldMapping: { amount: 'orders_total' },
                    elementReferences: ['[button "Revenue"]'],
                    sampleRows: [{ orders_total: '€12.00' }],
                },
            },
        );

        expect(
            (appModel.createWithVersion as ReturnType<typeof vi.fn>).mock
                .calls[0][1],
        ).toEqual({ version: 1, prompt: 'Make the bars teal' });
        const enqueue = (
            schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>
        ).mock.calls[0][0];
        expect(enqueue.prompt).toContain('Make the bars teal');
        expect(enqueue.prompt).toContain('orders_total');
        expect(enqueue.prompt).toContain('€12.00');
        expect(enqueue.prompt).toContain(JSON.stringify('[button "Revenue"]'));
        expect(
            JSON.stringify(
                (appModel.createWithVersion as ReturnType<typeof vi.fn>).mock
                    .calls[0][3],
            ),
        ).not.toContain('€12.00');
    });

    it('applies instance sample policy and bounds rows, columns, cells, and references', async () => {
        const sampleRows = Array.from({ length: 12 }, (_, row) =>
            Object.fromEntries(
                Array.from({ length: 22 }, (_value, column) => [
                    `field_${column}`,
                    column === 0
                        ? `${row}-${'x'.repeat(600)}`
                        : `${row}-${column}`,
                ]),
            ),
        );
        const vizContext = {
            sampleRows,
            elementReferences: Array.from({ length: 7 }, (_, i) => `ref-${i}`),
        };

        const enabled = buildService();
        await enabled.service.generateApp(
            USER,
            'project-1',
            'Revise chart',
            [],
            'app-1',
            undefined,
            undefined,
            DATA_APP_VIZ_TEMPLATE,
            undefined,
            undefined,
            undefined,
            { name: null, vizContext },
        );
        const enabledPrompt = (
            enabled.schedulerClient.appGeneratePipeline as ReturnType<
                typeof vi.fn
            >
        ).mock.calls[0][0].prompt as string;
        expect(enabledPrompt).toContain('ref-4');
        expect(enabledPrompt).not.toContain('ref-5');
        expect(enabledPrompt).toContain('9-19');
        expect(enabledPrompt).not.toContain('10-19');
        expect(enabledPrompt).not.toContain('0-20');
        expect(enabledPrompt).not.toContain('x'.repeat(501));

        const disabled = buildService({ sampleDataEnabled: false });
        await disabled.service.generateApp(
            USER,
            'project-1',
            'Revise chart',
            [],
            'app-1',
            undefined,
            undefined,
            DATA_APP_VIZ_TEMPLATE,
            undefined,
            undefined,
            undefined,
            { name: null, vizContext },
        );
        const disabledPrompt = (
            disabled.schedulerClient.appGeneratePipeline as ReturnType<
                typeof vi.fn
            >
        ).mock.calls[0][0].prompt as string;
        expect(disabledPrompt).toContain('ref-4');
        expect(disabledPrompt).not.toContain('sampleRows');
        expect(disabledPrompt).not.toContain('0-0');
    });

    it('uses the stored template on iteration and keeps context out of the version row', async () => {
        const { service, appModel, schedulerClient } = buildService();
        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'Add labels',
            [],
            undefined,
            undefined,
            undefined,
            {
                vizContext: {
                    schema,
                    sampleRows: [{ orders_total: '€12.00' }],
                },
            },
        );

        const createCall = (appModel.createVersion as ReturnType<typeof vi.fn>)
            .mock.calls[0];
        expect(createCall[1]).toEqual({ version: 2, prompt: 'Add labels' });
        expect(JSON.stringify(createCall[4])).not.toContain('€12.00');
        const enqueue = (
            schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>
        ).mock.calls[0][0];
        expect(enqueue.prompt).toContain('€12.00');
        expect(enqueue.prompt).toContain('"schema"');
    });

    it('drops sample rows on iteration when the instance disables samples', async () => {
        const { service, appModel, schedulerClient } = buildService({
            sampleDataEnabled: false,
        });
        await service.iterateApp(
            USER,
            'project-1',
            'app-1',
            'Add labels',
            [],
            undefined,
            undefined,
            undefined,
            {
                vizContext: {
                    schema,
                    sampleRows: [{ orders_total: '€12.00' }],
                },
            },
        );

        const enqueue = (
            schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>
        ).mock.calls[0][0];
        expect(enqueue.prompt).toContain('"schema"');
        expect(enqueue.prompt).not.toContain('sampleRows');
        expect(enqueue.prompt).not.toContain('€12.00');
        const createCall = (appModel.createVersion as ReturnType<typeof vi.fn>)
            .mock.calls[0];
        expect(createCall[1].prompt).toBe('Add labels');
        expect(JSON.stringify(createCall[4])).not.toContain('€12.00');
    });

    it('does not apply chart context to an ordinary data app', async () => {
        const { service, schedulerClient } = buildService();
        await service.generateApp(
            USER,
            'project-1',
            'Build a dashboard',
            [],
            'app-1',
            undefined,
            undefined,
            'dashboard',
            undefined,
            undefined,
            undefined,
            {
                name: null,
                vizContext: { sampleRows: [{ orders_total: '€12.00' }] },
            },
        );

        expect(
            (schedulerClient.appGeneratePipeline as ReturnType<typeof vi.fn>)
                .mock.calls[0][0].prompt,
        ).toBe('Build a dashboard');
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

    it('keeps legacy field examples and long guidance readable', () => {
        const legacySchema = {
            ...validSchema,
            fields: [
                {
                    ...validSchema.fields[0],
                    description: 'Legacy field help. '.repeat(20),
                    examples: [0, false, null],
                },
            ],
            inputGuidance: 'Legacy chart help. '.repeat(20),
        };
        expect(AppGenerateService.parseSchema(legacySchema)).toMatchObject({
            ...legacySchema,
            fields: [
                {
                    ...legacySchema.fields[0],
                    description: legacySchema.fields[0].description.trim(),
                },
            ],
            inputGuidance: legacySchema.inputGuidance.trim(),
        });
    });
});

describe('AppGenerateService.persistSchema', () => {
    const field = {
        name: 'category',
        label: 'Category',
        type: 'dimension',
        required: true,
    };

    const buildPersistSchema = () => {
        const setSchema = vi.fn();
        const { service } = buildService({ appModel: { setSchema } });
        const persistSchema = (structuredOutput: unknown) =>
            (
                service as unknown as {
                    persistSchema: (
                        output: unknown,
                        appUuid: string,
                        version: number,
                    ) => Promise<void>;
                }
            ).persistSchema(structuredOutput, 'app-1', 1);
        return { persistSchema, setSchema };
    };

    it.each([
        [{ ...field, description: 'a'.repeat(161) }, undefined],
        [field, 'a'.repeat(201)],
    ])(
        'rejects generated help over the limit',
        async (inputField, inputGuidance) => {
            const { persistSchema, setSchema } = buildPersistSchema();

            await persistSchema({
                fields: [inputField],
                configOptions: [],
                colorPalette: null,
                inputGuidance,
            });

            expect(setSchema).not.toHaveBeenCalled();
        },
    );

    it('persists valid generated help without legacy examples', async () => {
        const { persistSchema, setSchema } = buildPersistSchema();

        await persistSchema({
            fields: [
                {
                    ...field,
                    description: 'Category to plot.',
                    examples: [0, false, null],
                },
            ],
            configOptions: [],
            colorPalette: null,
            inputGuidance: 'One row per category.',
        });

        expect(setSchema).toHaveBeenCalledWith('app-1', 1, {
            fields: [{ ...field, description: 'Category to plot.' }],
            configOptions: [],
            colorPalette: null,
            inputGuidance: 'One row per category.',
        });
    });
});
