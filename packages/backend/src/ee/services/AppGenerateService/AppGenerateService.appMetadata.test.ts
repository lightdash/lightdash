// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import { generateObject } from 'ai';
import { type z } from 'zod';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    resolveKeyManagement: vi.fn(() => 'lightdash'),
}));
vi.mock('../ai/utils/aiCallTelemetry', () => ({
    getAiCallTelemetry: vi.fn(() => ({ isEnabled: false })),
    getLanguageModelAttribution: vi.fn(() => ({})),
}));

const FAST_MODEL_OPTIONS = {
    model: { provider: 'openai.responses', modelId: 'gpt-5.6-luna' },
    callOptions: {},
    providerOptions: {},
    keyManagement: 'lightdash-managed',
};

const generateObjectMock = vi.mocked(generateObject);

type MetadataResult = {
    name: string | null;
    description: string;
    icon: string | null;
};

function buildService() {
    const resolveFastModel = vi.fn().mockResolvedValue(FAST_MODEL_OPTIONS);
    const service = new AppGenerateService({
        lightdashConfig: { appRuntime: {} } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: {} as never,
        featureFlagModel: {} as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi
                .fn()
                .mockResolvedValue({ defaultProvider: 'openai' }),
            resolveFastModel,
        } as never,
        sandboxManager: null,
        appRuntimeS3: null,
        chartRegistryClient: {} as never,
    });
    const generateMetadata = (isChartType: boolean) =>
        (
            service as unknown as {
                generateAppMetadataFromPrompt: (
                    appUuid: string,
                    prompt: string,
                    organizationUuid: string,
                    projectUuid: string,
                    userUuid: string,
                    isChartType: boolean,
                ) => Promise<MetadataResult>;
            }
        ).generateAppMetadataFromPrompt(
            'app-1',
            'a radial gauge',
            'org-1',
            'project-1',
            'user-1',
            isChartType,
        );
    return { generateMetadata, resolveFastModel };
}

/** What the metadata call actually handed to the model. */
function sentCall() {
    const call = generateObjectMock.mock.calls[0][0] as unknown as {
        schema: z.ZodObject<z.ZodRawShape>;
        messages: { role: string; content: string }[];
    };
    return {
        schemaKeys: Object.keys(call.schema.shape),
        system: call.messages.find((m) => m.role === 'system')!.content,
    };
}

function mockObject(object: Record<string, unknown>) {
    generateObjectMock.mockResolvedValue({ object, usage: {} } as never);
}

beforeEach(() => {
    generateObjectMock.mockReset();
});

describe('AppGenerateService app metadata generation', () => {
    it('asks a chart type for an icon in the same call', async () => {
        mockObject({
            name: 'Radial Gauge',
            description: 'A radial gauge.',
            icon: 'gauge',
        });
        const { generateMetadata } = buildService();

        const result = await generateMetadata(true);

        expect(generateObjectMock).toHaveBeenCalledOnce();
        const { schemaKeys, system } = sentCall();
        expect(schemaKeys).toContain('icon');
        expect(system).toContain('reusable chart type');
        expect(result).toEqual({
            name: 'Radial Gauge',
            description: 'A radial gauge.',
            icon: 'gauge',
        });
    });

    it('never asks a data app for an icon', async () => {
        mockObject({ name: 'Revenue App', description: 'Revenue.' });
        const { generateMetadata } = buildService();

        const result = await generateMetadata(false);

        const { schemaKeys, system } = sentCall();
        expect(schemaKeys).not.toContain('icon');
        expect(system).not.toContain('reusable chart type');
        expect(result.icon).toBeNull();
    });

    it('drops an icon that is not in the curated set', async () => {
        mockObject({
            name: 'Radial Gauge',
            description: 'A radial gauge.',
            icon: 'skull',
        });
        const { generateMetadata } = buildService();

        expect((await generateMetadata(true)).icon).toBeNull();
    });

    it('leaves the icon unset when no provider is configured', async () => {
        const { generateMetadata, resolveFastModel } = buildService();
        resolveFastModel.mockRejectedValueOnce(new Error('not configured'));

        await expect(generateMetadata(true)).resolves.toEqual({
            name: null,
            description: '',
            icon: null,
        });
        expect(generateObjectMock).not.toHaveBeenCalled();
    });
});
