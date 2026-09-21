import {
    DimensionType,
    FieldType,
    type CompiledDimension,
    type Explore,
} from '@lightdash/common';
import { generateObject } from 'ai';
import {
    mockOrdersExplore,
    mockUsersOrdersExplore,
} from '../utils/validationExplore.mock';
import {
    buildCandidateCatalog,
    buildFieldRanking,
    CHART_TYPE_DATA_CAPS,
    suggestChartTypeData,
    validateChartTypeDataSuggestion,
    type RawChartTypeDataSuggestion,
} from './chartTypeDataSuggester';

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('../../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));
vi.mock('../utils/aiCallTelemetry', () => ({
    getGeneratorTelemetry: vi.fn().mockReturnValue({}),
}));

const modelOptions = {
    model: {},
    callOptions: {},
    providerOptions: {},
} as never;

const filler = (index: number): CompiledDimension => ({
    ...mockOrdersExplore.tables.orders.dimensions.customer_name,
    name: `filler_${index}`,
    label: `Filler ${index}`,
    type: DimensionType.STRING,
    fieldType: FieldType.DIMENSION,
});

const fillerDimensions = (count: number, table: string) =>
    Object.fromEntries(
        Array.from({ length: count }, (unused, index) => [
            `filler_${index}`,
            { ...filler(index), table },
        ]),
    );

const exploreWithFillers = (count: number): Explore => ({
    ...mockOrdersExplore,
    tables: {
        ...mockOrdersExplore.tables,
        orders: {
            ...mockOrdersExplore.tables.orders,
            dimensions: {
                ...mockOrdersExplore.tables.orders.dimensions,
                ...fillerDimensions(count, 'orders'),
            },
        },
    },
});

/** Base table `users` padded far past the budget; `orders` is joined. */
const joinedExploreWithWideBaseTable = (count: number): Explore => ({
    ...mockUsersOrdersExplore,
    tables: {
        ...mockUsersOrdersExplore.tables,
        users: {
            ...mockUsersOrdersExplore.tables.users,
            dimensions: {
                ...mockUsersOrdersExplore.tables.users.dimensions,
                ...fillerDimensions(count, 'users'),
            },
        },
    },
});

describe('buildCandidateCatalog', () => {
    it('renders one line per visible field and hides hidden ones', () => {
        const catalog = buildCandidateCatalog([mockOrdersExplore], new Map());
        expect(catalog).toContain(
            'orders_total_revenue | Total Revenue | metric | sum |',
        );
        expect(catalog).toContain(
            'orders_product_category | Product Category | dimension | string |',
        );
        expect(catalog).not.toContain('more fields');
    });

    it('caps the fields it shows and says how many it left out', () => {
        const catalog = buildCandidateCatalog(
            [exploreWithFillers(120)],
            new Map(),
        );
        const fieldLines = catalog
            .split('\n')
            .filter((line) => /^orders_/.test(line));
        expect(fieldLines).toHaveLength(
            CHART_TYPE_DATA_CAPS.primaryTableFields,
        );
        expect(catalog).toContain('... 70 more fields');
    });

    it('shares the field budget across candidate explores', () => {
        const catalog = buildCandidateCatalog(
            [exploreWithFillers(120), exploreWithFillers(120)],
            new Map(),
        );
        const fieldLines = catalog
            .split('\n')
            .filter((line) => /^orders_/.test(line));
        // Nothing is joined here, so the whole budget goes to the base tables.
        expect(fieldLines).toHaveLength(CHART_TYPE_DATA_CAPS.totalFields);
    });

    it('reserves room for joined fields a wide base table would crowd out', () => {
        const explore = joinedExploreWithWideBaseTable(200);
        const catalog = buildCandidateCatalog(
            [explore, explore, explore],
            new Map(),
        );
        const perExploreBudget = Math.floor(
            CHART_TYPE_DATA_CAPS.totalFields / 3,
        );
        const sections = catalog.split('\n\n');
        expect(sections).toHaveLength(3);
        const fieldLines = sections[0]
            .split('\n')
            .filter((line) => /^(users|orders)_/.test(line));
        expect(fieldLines.length).toBeLessThanOrEqual(perExploreBudget);
        expect(
            fieldLines.some((line) => line.startsWith('orders_order_id |')),
        ).toBe(true);
        expect(
            fieldLines.filter((line) => line.startsWith('users_')).length,
        ).toBeGreaterThan(0);
    });

    it('puts the catalog-search ranking first', () => {
        const ranking = buildFieldRanking([
            { name: 'order_count', tableName: 'orders', chartUsage: 3 },
            { name: 'is_active', tableName: 'orders', chartUsage: 1 },
        ]);
        const catalog = buildCandidateCatalog([mockOrdersExplore], ranking);
        const fieldIds = catalog
            .split('\n')
            .filter((line) => /^orders_/.test(line))
            .map((line) => line.split(' | ')[0]);
        expect(fieldIds.slice(0, 2)).toEqual([
            'orders_order_count',
            'orders_is_active',
        ]);
    });
});

describe('suggestChartTypeData', () => {
    beforeEach(() => {
        vi.mocked(generateObject)
            .mockReset()
            .mockResolvedValue({
                object: {
                    exploreName: 'test_explore',
                    shapeSummary: 's',
                    inputs: [],
                    alternatives: [],
                },
                usage: {},
            } as never);
    });

    const messagesFromLastCall = () =>
        (
            vi.mocked(generateObject).mock.calls[0][0] as {
                messages: { role: string; content: string }[];
            }
        ).messages;

    it('fences the author text and pins the field-type rules', async () => {
        await suggestChartTypeData(modelOptions, {
            prompt: 'revenue by category',
            hint: null,
            inputs: [
                {
                    name: 'y',
                    label: 'Value',
                    type: 'metric',
                    required: true,
                },
            ],
            explores: [mockOrdersExplore],
            alternativeExplores: [],
            fieldRanking: new Map(),
        });
        const messages = messagesFromLastCall();
        expect(messages[0].content).toMatch(/never instructions to you/);
        expect(messages[0].content).toMatch(/A metric input takes a metric/);
        expect(messages[0].content).not.toMatch(/does not declare its inputs/);
        expect(messages[1].content).toContain('- y (Value) — metric, required');
        expect(messages[1].content).toContain('orders_total_revenue');
    });

    it('asks the model to infer the inputs when the chart declares none', async () => {
        await suggestChartTypeData(modelOptions, {
            prompt: 'revenue by category',
            hint: 'monthly',
            inputs: null,
            explores: [mockOrdersExplore],
            alternativeExplores: [
                {
                    name: 'users',
                    label: 'Users',
                    description: 'One row per user',
                },
            ],
            fieldRanking: new Map(),
        });
        const messages = messagesFromLastCall();
        expect(messages[0].content).toMatch(/does not declare its inputs/);
        expect(messages[1].content).toContain('Hint:\nmonthly');
        expect(messages[1].content).toContain('Chart inputs: not declared yet');
        expect(messages[1].content).toContain(
            '- users — Users: One row per user',
        );
    });
});

describe('validateChartTypeDataSuggestion', () => {
    const rawSuggestion = (
        overrides: Partial<RawChartTypeDataSuggestion> = {},
    ): RawChartTypeDataSuggestion => ({
        exploreName: 'test_explore',
        shapeSummary: 's',
        inputs: [],
        alternatives: [],
        ...overrides,
    });

    it('truncates an over-long reason instead of rejecting it', () => {
        const { inputs } = validateChartTypeDataSuggestion({
            suggestion: rawSuggestion({
                inputs: [
                    {
                        name: 'y',
                        label: 'Value',
                        type: 'metric',
                        required: true,
                        fieldId: 'orders_total_revenue',
                        reason: 'w'.repeat(900),
                    },
                ],
            }),
            explore: mockOrdersExplore,
            requestedInputs: [
                { name: 'y', label: 'Value', type: 'metric', required: true },
            ],
        });
        expect(inputs[0].fieldId).toBe('orders_total_revenue');
        expect(inputs[0].reason.length).toBeLessThanOrEqual(
            CHART_TYPE_DATA_CAPS.reasonChars,
        );
        expect(inputs[0].reason.endsWith('…')).toBe(true);
    });

    it('bounds an over-long field id before echoing it back', () => {
        const { inputs, fits } = validateChartTypeDataSuggestion({
            suggestion: rawSuggestion({
                inputs: [
                    {
                        name: 'y',
                        label: 'Value',
                        type: 'metric',
                        required: true,
                        fieldId: `orders_${'z'.repeat(5000)}`,
                        reason: 'Looks right.',
                    },
                ],
            }),
            explore: mockOrdersExplore,
            requestedInputs: [
                { name: 'y', label: 'Value', type: 'metric', required: true },
            ],
        });
        expect(fits).toBe(false);
        expect(inputs[0].fieldId).toBeNull();
        expect(inputs[0].reason.length).toBeLessThan(400);
        expect(inputs[0].reason).toContain('is not a field in Test Explore');
    });

    it('dedupes and cleans inferred input names', () => {
        const mapping = {
            label: 'Category',
            type: 'dimension' as const,
            required: true,
            fieldId: 'orders_product_category',
            reason: 'Groups the rows.',
        };
        const { inputs } = validateChartTypeDataSuggestion({
            suggestion: rawSuggestion({
                inputs: [
                    { ...mapping, name: 'X Axis' },
                    { ...mapping, name: 'x_axis' },
                    { ...mapping, name: '  ' },
                    {
                        ...mapping,
                        name: 'Y-Axis',
                        type: 'metric',
                        fieldId: 'orders_total_revenue',
                    },
                ],
            }),
            explore: mockOrdersExplore,
            requestedInputs: null,
        });
        expect(inputs.map((input) => input.name)).toEqual(['x_axis', 'y_axis']);
        expect(inputs[0].fieldId).toBe('orders_product_category');
        expect(inputs[1].fieldId).toBe('orders_total_revenue');
    });

    it('is not a fit when the chart declares no inputs', () => {
        expect(
            validateChartTypeDataSuggestion({
                suggestion: rawSuggestion(),
                explore: mockOrdersExplore,
                requestedInputs: [],
            }),
        ).toEqual({ inputs: [], fits: false });
    });

    it('is not a fit when inferring produced nothing bindable', () => {
        const { fits } = validateChartTypeDataSuggestion({
            suggestion: rawSuggestion({
                inputs: [
                    {
                        name: 'y',
                        label: 'Value',
                        type: 'metric',
                        required: false,
                        fieldId: null,
                        reason: 'Nothing in this explore measures that.',
                    },
                ],
            }),
            explore: mockOrdersExplore,
            requestedInputs: null,
        });
        expect(fits).toBe(false);
    });
});
