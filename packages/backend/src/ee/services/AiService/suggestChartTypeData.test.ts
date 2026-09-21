import { Ability } from '@casl/ability';
import {
    ParameterError,
    type DataAppVizField,
    type Explore,
    type SessionUser,
} from '@lightdash/common';
import {
    suggestChartTypeData as suggestChartTypeDataFromContext,
    type RawChartTypeDataSuggestion,
} from '../ai/agents/chartTypeDataSuggester';
import { mockOrdersExplore } from '../ai/utils/validationExplore.mock';
import { AiService } from './AiService';

vi.mock('../ai/agents/chartTypeDataSuggester', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../ai/agents/chartTypeDataSuggester')
    >()),
    suggestChartTypeData: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    getModel: () => ({ model: 'test', keyManagement: null }),
}));

const abilityRules = [{ action: 'manage', subject: 'Explore' }];
const user = {
    userUuid: 'user',
    organizationUuid: 'org',
    organizationName: 'Org',
    ability: new Ability(abilityRules),
    abilityRules,
} as unknown as SessionUser;

const inputs: DataAppVizField[] = [
    { name: 'x', label: 'Category', type: 'dimension', required: true },
    { name: 'y', label: 'Value', type: 'metric', required: true },
];

const suggestion = (
    overrides: Partial<RawChartTypeDataSuggestion> = {},
): RawChartTypeDataSuggestion => ({
    exploreName: 'test_explore',
    shapeSummary: 'One row per product category with its revenue.',
    inputs: [
        {
            name: 'x',
            label: 'Category',
            type: 'dimension',
            required: true,
            fieldId: 'orders_product_category',
            reason: 'Groups the rows by category.',
        },
        {
            name: 'y',
            label: 'Value',
            type: 'metric',
            required: true,
            fieldId: 'orders_total_revenue',
            reason: 'The measure being compared.',
        },
    ],
    alternatives: [],
    ...overrides,
});

const setup = ({
    exploreSearchResults = [
        { name: 'test_explore', label: 'Test Explore' },
        { name: 'other_explore', label: 'Other Explore' },
    ],
    explore = mockOrdersExplore,
}: {
    exploreSearchResults?: Array<{ name: string; label: string }>;
    explore?: Explore;
} = {}) => {
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const orgAiCopilotConfigResolver = {
        getCopilotConfig: vi.fn().mockResolvedValue({ providers: {} }),
        getAccessibleModelIds: vi.fn(),
    };
    const projectService = {
        getProject: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
    };
    const analytics = { track: vi.fn() };
    const runtime = {
        findExplores: vi.fn().mockResolvedValue({
            exploreSearchResults,
            topMatchingFields: [
                {
                    name: 'total_revenue',
                    tableName: 'orders',
                    label: 'Total Revenue',
                    fieldType: 'metric',
                    chartUsage: 9,
                },
            ],
        }),
        getExplore: vi.fn().mockResolvedValue(explore),
    };
    // Records every runtime member the service reaches for, so a warehouse
    // call would show up here.
    const runtimeMembersUsed: string[] = [];
    const recordingRuntime = new Proxy(runtime, {
        get(target, property: string) {
            runtimeMembersUsed.push(property);
            return target[property as keyof typeof target];
        },
    });
    const aiAgentToolsService = {
        createRuntime: vi.fn(() => recordingRuntime),
    };
    const service = new AiService({
        featureFlagService,
        orgAiCopilotConfigResolver,
        projectService,
        analytics,
        getAiAgentToolsService: () => aiAgentToolsService,
    } as unknown as ConstructorParameters<typeof AiService>[0]);
    return {
        service,
        featureFlagService,
        runtime,
        runtimeMembersUsed,
        analytics,
        aiAgentToolsService,
    };
};

const request = (overrides: Record<string, unknown> = {}) => ({
    prompt: 'revenue by product category',
    inputs,
    hint: null,
    exploreName: null,
    ...overrides,
});

beforeEach(() => {
    vi.mocked(suggestChartTypeDataFromContext)
        .mockReset()
        .mockResolvedValue(suggestion());
});

it('maps declared inputs to validated fields of the chosen explore', async () => {
    const { service, runtime, analytics } = setup();
    const result = await service.suggestChartTypeData(
        user,
        'project',
        request(),
    );
    expect(result).toEqual({
        kind: 'suggested',
        exploreName: 'test_explore',
        exploreLabel: 'Test Explore',
        shapeSummary: 'One row per product category with its revenue.',
        fits: true,
        alternatives: [],
        inputs: [
            {
                name: 'x',
                label: 'Category',
                type: 'dimension',
                required: true,
                fieldId: 'orders_product_category',
                fieldLabel: 'Product Category',
                fieldType: 'dimension',
                reason: 'Groups the rows by category.',
            },
            {
                name: 'y',
                label: 'Value',
                type: 'metric',
                required: true,
                fieldId: 'orders_total_revenue',
                fieldLabel: 'Total Revenue',
                fieldType: 'metric',
                reason: 'The measure being compared.',
            },
        ],
    });
    expect(runtime.findExplores).toHaveBeenCalledWith({
        searchQuery: 'revenue by product category Category Value',
        fieldSearchSize: 50,
    });
    expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
            event: 'ai.chart_type_data.suggested',
            properties: expect.objectContaining({
                candidateExploreCount: 2,
                inputCount: 2,
                mappedInputCount: 2,
                inputsInferred: false,
                fits: true,
            }),
        }),
    );
});

it('returns the inputs the model inferred when the chart declares none', async () => {
    const { service } = setup();
    const result = await service.suggestChartTypeData(
        user,
        'project',
        request({ inputs: null }),
    );
    expect(result).toMatchObject({
        kind: 'suggested',
        fits: true,
        inputs: [
            expect.objectContaining({
                name: 'x',
                label: 'Category',
                fieldId: 'orders_product_category',
            }),
            expect.objectContaining({
                name: 'y',
                label: 'Value',
                fieldId: 'orders_total_revenue',
            }),
        ],
    });
    const [, context] = vi.mocked(suggestChartTypeDataFromContext).mock
        .calls[0];
    expect(context.inputs).toBeNull();
});

it('drops an unknown field id and reports that the chart does not fit', async () => {
    const { service } = setup();
    vi.mocked(suggestChartTypeDataFromContext).mockResolvedValue(
        suggestion({
            inputs: [
                {
                    name: 'x',
                    label: 'Category',
                    type: 'dimension',
                    required: true,
                    fieldId: 'orders_product_categories',
                    reason: 'Groups the rows by category.',
                },
                {
                    name: 'y',
                    label: 'Value',
                    type: 'metric',
                    required: false,
                    fieldId: 'orders_total_revenue',
                    reason: 'The measure being compared.',
                },
            ],
        }),
    );
    const result = await service.suggestChartTypeData(
        user,
        'project',
        request(),
    );
    expect(result).toMatchObject({
        kind: 'suggested',
        fits: false,
        inputs: [
            {
                fieldId: null,
                fieldLabel: null,
                fieldType: null,
                reason: expect.stringMatching(
                    /^"orders_product_categories" is not a field in Test Explore\. Closest: orders_product_category,/,
                ),
            },
            { fieldId: 'orders_total_revenue' },
        ],
    });
    expect(suggestChartTypeDataFromContext).toHaveBeenCalledTimes(1);
});

it('drops a dimension offered for a metric input', async () => {
    const { service } = setup();
    vi.mocked(suggestChartTypeDataFromContext).mockResolvedValue(
        suggestion({
            inputs: [
                {
                    name: 'x',
                    label: 'Category',
                    type: 'dimension',
                    required: true,
                    fieldId: 'orders_product_category',
                    reason: 'Groups the rows by category.',
                },
                {
                    name: 'y',
                    label: 'Value',
                    type: 'metric',
                    required: true,
                    fieldId: 'orders_amount',
                    reason: 'The raw amount column.',
                },
            ],
        }),
    );
    expect(
        await service.suggestChartTypeData(user, 'project', request()),
    ).toMatchObject({
        kind: 'suggested',
        fits: false,
        inputs: [
            { fieldId: 'orders_product_category' },
            {
                fieldId: null,
                reason: 'Amount is a dimension; this input needs a metric.',
            },
        ],
    });
});

it('drops a hidden field, which is how an attribute-filtered explore arrives', async () => {
    const { orders } = mockOrdersExplore.tables;
    const { service } = setup({
        explore: {
            ...mockOrdersExplore,
            tables: {
                ...mockOrdersExplore.tables,
                orders: {
                    ...orders,
                    metrics: {
                        ...orders.metrics,
                        total_revenue: {
                            ...orders.metrics.total_revenue,
                            hidden: true,
                        },
                    },
                },
            },
        },
    });
    expect(
        await service.suggestChartTypeData(user, 'project', request()),
    ).toMatchObject({
        kind: 'suggested',
        fits: false,
        inputs: [
            { fieldId: 'orders_product_category' },
            {
                fieldId: null,
                reason: expect.stringContaining(
                    '"orders_total_revenue" is not a field',
                ),
            },
        ],
    });
});

it('keeps only alternatives the explore search returned, never the chosen one, and never twice', async () => {
    const { service } = setup();
    vi.mocked(suggestChartTypeDataFromContext).mockResolvedValue(
        suggestion({
            alternatives: [
                { exploreName: 'test_explore', summary: 'The chosen one.' },
                { exploreName: 'other_explore', summary: 'Per user instead.' },
                { exploreName: 'other_explore', summary: 'Said twice.' },
                { exploreName: 'invented_explore', summary: 'Made up.' },
            ],
        }),
    );
    expect(
        await service.suggestChartTypeData(user, 'project', request()),
    ).toMatchObject({
        alternatives: [
            {
                exploreName: 'other_explore',
                exploreLabel: 'Other Explore',
                summary: 'Per user instead.',
            },
        ],
    });
});

it('truncates an over-long shape summary rather than failing', async () => {
    const { service } = setup();
    vi.mocked(suggestChartTypeDataFromContext).mockResolvedValue(
        suggestion({ shapeSummary: 'w'.repeat(2000) }),
    );
    const result = await service.suggestChartTypeData(
        user,
        'project',
        request(),
    );
    expect(result).toMatchObject({ kind: 'suggested' });
    const { shapeSummary } = result as { shapeSummary: string };
    expect(shapeSummary.length).toBeLessThanOrEqual(300);
    expect(shapeSummary.endsWith('…')).toBe(true);
});

it('reports no data when the model picks an explore outside the candidates', async () => {
    const { service } = setup();
    vi.mocked(suggestChartTypeDataFromContext).mockResolvedValue(
        suggestion({ exploreName: 'somewhere_else' }),
    );
    expect(
        await service.suggestChartTypeData(user, 'project', request()),
    ).toEqual({
        kind: 'no_data',
        reason: 'Could not settle on an explore for that description. Try naming the data you want.',
    });
});

it('reports no data without calling the model when nothing matches', async () => {
    const { service, runtime } = setup({ exploreSearchResults: [] });
    expect(
        await service.suggestChartTypeData(user, 'project', request()),
    ).toEqual({
        kind: 'no_data',
        reason: 'No explore in this project matches that description.',
    });
    expect(suggestChartTypeDataFromContext).not.toHaveBeenCalled();
    expect(runtime.getExplore).not.toHaveBeenCalled();
});

it('reports no data when every matching explore is out of reach', async () => {
    const { service, runtime } = setup();
    runtime.getExplore.mockRejectedValue(new Error('Explore not found'));
    expect(
        await service.suggestChartTypeData(user, 'project', request()),
    ).toEqual({
        kind: 'no_data',
        reason: 'No explore you can access matches that description.',
    });
    expect(suggestChartTypeDataFromContext).not.toHaveBeenCalled();
});

it('pins the named explore but still ranks its fields from the catalog', async () => {
    const { service, runtime } = setup();
    const result = await service.suggestChartTypeData(
        user,
        'project',
        request({ exploreName: 'test_explore' }),
    );
    expect(runtime.findExplores).toHaveBeenCalledTimes(1);
    expect(runtime.getExplore).toHaveBeenCalledTimes(1);
    expect(runtime.getExplore).toHaveBeenCalledWith({ table: 'test_explore' });
    const [, context] = vi.mocked(suggestChartTypeDataFromContext).mock
        .calls[0];
    expect(context.fieldRanking.get('orders_total_revenue')).toEqual({
        order: 0,
        chartUsage: 9,
    });
    // A pinned explore is the author's choice; nothing else is offered.
    expect(context.alternativeExplores).toEqual([]);
    expect(result).toMatchObject({ kind: 'suggested', alternatives: [] });
});

it('is not a fit when the chart declares no inputs at all', async () => {
    const { service } = setup();
    const result = await service.suggestChartTypeData(
        user,
        'project',
        request({ inputs: [] }),
    );
    expect(result).toMatchObject({
        kind: 'suggested',
        inputs: [],
        fits: false,
    });
    const [, context] = vi.mocked(suggestChartTypeDataFromContext).mock
        .calls[0];
    expect(context.inputs).toEqual([]);
});

it('rejects an empty prompt before doing any work', async () => {
    const { service, aiAgentToolsService } = setup();
    await expect(
        service.suggestChartTypeData(
            user,
            'project',
            request({ prompt: '  ' }),
        ),
    ).rejects.toThrow(ParameterError);
    expect(aiAgentToolsService.createRuntime).not.toHaveBeenCalled();
});

it('truncates an over-long prompt, hint and input list instead of rejecting', async () => {
    const { service } = setup();
    await service.suggestChartTypeData(
        user,
        'project',
        request({
            prompt: 'p'.repeat(5000),
            hint: `  ${'h'.repeat(5000)}  `,
            inputs: Array.from({ length: 40 }, (unused, index) => ({
                name: `f_${index}`,
                label: `Field ${index}`,
                type: 'dimension' as const,
                required: false,
            })),
        }),
    );
    const [, context] = vi.mocked(suggestChartTypeDataFromContext).mock
        .calls[0];
    expect(context.prompt).toHaveLength(2000);
    expect(context.hint).toHaveLength(500);
    expect(context.inputs).toHaveLength(24);
});

it('rejects without calling the model when Ambient AI is unavailable', async () => {
    const { service, featureFlagService, aiAgentToolsService } = setup();
    featureFlagService.get.mockResolvedValue({ enabled: false });
    await expect(
        service.suggestChartTypeData(user, 'project', request()),
    ).rejects.toThrow('Ambient AI is not available');
    expect(suggestChartTypeDataFromContext).not.toHaveBeenCalled();
    expect(aiAgentToolsService.createRuntime).not.toHaveBeenCalled();
});

it('only ever reads explore metadata from the runtime', async () => {
    const { service, runtimeMembersUsed } = setup();
    await service.suggestChartTypeData(user, 'project', request());
    expect(new Set(runtimeMembersUsed)).toEqual(
        new Set(['findExplores', 'getExplore']),
    );
});
