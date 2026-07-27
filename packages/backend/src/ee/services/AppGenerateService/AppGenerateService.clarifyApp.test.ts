// Stub the e2b/ai SDKs before importing AppGenerateService so the tests never
// reach the real sandbox or model client.
import { DATA_APP_VIZ_TEMPLATE, type DataAppTemplate } from '@lightdash/common';
import { generateObject } from 'ai';
import { AppGenerateService } from './AppGenerateService';
import {
    CLARIFY_APP_SYSTEM_PROMPT,
    CLARIFY_VIZ_SYSTEM_PROMPT,
} from './clarifierPrompts';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    getModel: vi.fn(() => ({
        model: { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
        callOptions: {},
        providerOptions: {},
        keyManagement: 'lightdash',
    })),
    resolveKeyManagement: vi.fn(() => 'lightdash'),
}));
vi.mock('../ai/utils/aiCallTelemetry', () => ({
    getAiCallTelemetry: vi.fn(() => ({ isEnabled: false })),
    getLanguageModelAttribution: vi.fn(() => ({})),
}));
vi.mock('../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(() => ({})),
}));

// `ability`/`abilityRules` are only read by `fromSession`, which the attached
// -resources path goes through to resolve chart names.
const USER = {
    userUuid: 'user-1',
    organizationUuid: 'org-1',
    ability: { can: () => true, cannot: () => false },
    abilityRules: [],
} as never;

const CATALOG_ITEMS = [
    {
        type: 'field',
        tableName: 'orders',
        name: 'order_date',
        fieldType: 'dimension',
    },
    {
        type: 'field',
        tableName: 'orders',
        name: 'total_revenue',
        fieldType: 'metric',
    },
];

function buildService() {
    const getCatalogItemsSummary = vi.fn().mockResolvedValue(CATALOG_ITEMS);
    const service = new AppGenerateService({
        lightdashConfig: {
            appRuntime: { sampleDataEnabled: true },
        } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: { getCatalogItemsSummary } as never,
        appModel: {} as never,
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
        savedChartService: {
            get: vi.fn().mockResolvedValue({
                name: 'Revenue by month',
                tableName: 'orders',
            }),
        } as never,
        spacePermissionService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi
                .fn()
                .mockResolvedValue({ defaultProvider: 'anthropic' }),
        } as never,
    });
    // Bypass real CASL — the prompt/context selection is what these tests cover.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ cannot: () => false });
    return { service, getCatalogItemsSummary };
}

const generateObjectMock = vi.mocked(generateObject);

function mockQuestions(questions: string[]) {
    generateObjectMock.mockResolvedValue({
        object: { questions },
        usage: {},
    } as never);
}

/** The system + user message the clarifier actually handed to the model. */
function sentMessages() {
    const call = generateObjectMock.mock.calls[0][0] as {
        messages: { role: string; content: string }[];
    };
    const system = call.messages.find((m) => m.role === 'system')!.content;
    const userMessage = call.messages.find((m) => m.role === 'user')!.content;
    return { system, userMessage };
}

async function clarify(template: DataAppTemplate | undefined) {
    const { service, getCatalogItemsSummary } = buildService();
    const result = await service.clarifyApp(
        USER,
        'project-1',
        'a radial gauge',
        template,
    );
    return { result, getCatalogItemsSummary, ...sentMessages() };
}

beforeEach(() => {
    generateObjectMock.mockReset();
    mockQuestions([]);
});

describe('AppGenerateService.clarifyApp for the data app viz template', () => {
    it('never sends catalog context, so no data question can be grounded', async () => {
        const { getCatalogItemsSummary, userMessage } = await clarify(
            DATA_APP_VIZ_TEMPLATE,
        );

        // A data app viz never runs a query — it renders the rows the host
        // explore hands it — so the catalog is neither fetched nor sent.
        expect(getCatalogItemsSummary).not.toHaveBeenCalled();
        expect(userMessage).not.toContain('Available tables and key fields');
        expect(userMessage).not.toContain('orders');
        expect(userMessage).not.toContain('total_revenue');
        // The viz system prompt already fixes the kind.
        expect(userMessage).not.toContain('App kind');
        expect(userMessage).toContain('a radial gauge');
    });

    it('still passes attached resources through as visual reference', async () => {
        const { service } = buildService();

        await service.clarifyApp(
            USER,
            'project-1',
            'a radial gauge',
            DATA_APP_VIZ_TEMPLATE,
            [{ uuid: 'chart-1', includeSampleData: false, linkLive: false }],
            undefined,
            ['image-1', 'image-2'],
        );

        const { userMessage } = sentMessages();
        expect(userMessage).toContain('Chart: "Revenue by month"');
        expect(userMessage).toContain('2 images attached as design reference');
    });

    it('routes to the viz system prompt, not the app one', async () => {
        const { system } = await clarify(DATA_APP_VIZ_TEMPLATE);

        expect(system).toBe(CLARIFY_VIZ_SYSTEM_PROMPT);
    });

    it('still caps at 4 questions and drops blank ones', async () => {
        mockQuestions([
            'Which chart type do you want?',
            '  ',
            'Should it split by a series field?',
            'Is the value axis one metric?',
            'Do you want a legend?',
            'A fifth question that must be dropped?',
        ]);
        const { service } = buildService();

        const { questions } = await service.clarifyApp(
            USER,
            'project-1',
            'a radial gauge',
            DATA_APP_VIZ_TEMPLATE,
        );

        expect(questions).toEqual([
            'Which chart type do you want?',
            'Should it split by a series field?',
            'Is the value axis one metric?',
            'Do you want a legend?',
        ]);
    });

    it('still falls through to no questions when the model call fails', async () => {
        generateObjectMock.mockRejectedValue(new Error('provider exploded'));
        const { service } = buildService();

        await expect(
            service.clarifyApp(
                USER,
                'project-1',
                'a radial gauge',
                DATA_APP_VIZ_TEMPLATE,
            ),
        ).resolves.toEqual({ questions: [] });
    });
});

describe('AppGenerateService.clarifyApp for app templates', () => {
    it.each<DataAppTemplate | undefined>([
        'dashboard',
        'slideshow',
        'pdf',
        'custom',
        undefined,
    ])('keeps the catalog-grounded app prompt for %s', async (template) => {
        const { getCatalogItemsSummary, system, userMessage } =
            await clarify(template);

        expect(getCatalogItemsSummary).toHaveBeenCalledWith('project-1');
        expect(userMessage).toContain('Available tables and key fields');
        expect(userMessage).toContain('orders');
        expect(userMessage).toContain(`App kind: ${template ?? 'custom'}`);

        expect(system).toBe(CLARIFY_APP_SYSTEM_PROMPT);
    });
});

// Guards the prompt text itself. A data app viz has no say over the query, so
// the viz prompt must never invite a question the user cannot answer at build
// time — these are the assertions that would catch app framing creeping back in.
describe('CLARIFY_VIZ_SYSTEM_PROMPT', () => {
    it('keeps the shared bias against asking anything', () => {
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).toContain(
            'DEFAULT TO ASKING NOTHING',
        );
    });

    it('carries none of the app prompt data or layout guidance', () => {
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).not.toContain(
            'Which tables or metrics to query',
        );
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).not.toContain(
            'Default time range, when',
        );
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).not.toContain('single-page vs tabs');
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).not.toContain('layout density');
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).not.toContain('App kind context');
    });

    it('scopes the askable set to the component and its declared fields', () => {
        // The three cases GLITCH-639 calls out as genuinely viz-shaped.
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).toMatch(/chart type/i);
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).toMatch(/series\/breakdown/i);
        expect(CLARIFY_VIZ_SYSTEM_PROMPT).toMatch(/one metric or several/i);
    });
});
