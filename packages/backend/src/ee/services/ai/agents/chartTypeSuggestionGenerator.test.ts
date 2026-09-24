import {
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizField,
    type Explore,
} from '@lightdash/common';
import { generateText, NoObjectGeneratedError } from 'ai';
import {
    buildChartTypeExplorePrompt,
    buildChartTypeFieldsPrompt,
    exploreSatisfiesInputs,
    getChartTypeFieldCandidates,
    sanitizeChartTypeFieldSuggestions,
    suggestChartTypeExplore,
    suggestChartTypeFields,
    type ChartTypeFieldsContext,
    type RawChartTypeFieldSuggestions,
} from './chartTypeSuggestionGenerator';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));

const dimension = (
    table: string,
    name: string,
    label: string,
    type: DimensionType,
    hidden = false,
) => ({
    fieldType: FieldType.DIMENSION,
    table,
    tableLabel: table,
    name,
    label,
    type,
    hidden,
    sql: name,
    compiledSql: name,
    tablesReferences: [table],
});

const metric = (
    table: string,
    name: string,
    label: string,
    type: MetricType,
    hidden = false,
) => ({
    ...dimension(table, name, label, DimensionType.NUMBER, hidden),
    fieldType: FieldType.METRIC,
    type,
});

const makeExplore = (withMetrics = true, withDimensions = true): Explore =>
    ({
        name: 'orders',
        label: 'Orders',
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                dimensions: withDimensions
                    ? {
                          order_date: dimension(
                              'orders',
                              'order_date',
                              'Order date',
                              DimensionType.DATE,
                          ),
                          status: dimension(
                              'orders',
                              'status',
                              'Status',
                              DimensionType.STRING,
                          ),
                          secret: dimension(
                              'orders',
                              'secret',
                              'Secret',
                              DimensionType.STRING,
                              true,
                          ),
                      }
                    : {},
                metrics: withMetrics
                    ? {
                          revenue: metric(
                              'orders',
                              'revenue',
                              'Revenue',
                              MetricType.SUM,
                          ),
                          order_count: metric(
                              'orders',
                              'order_count',
                              'Order count',
                              MetricType.COUNT,
                          ),
                      }
                    : {},
            },
            customers: {
                name: 'customers',
                label: 'Customers',
                dimensions: {
                    region: dimension(
                        'customers',
                        'region',
                        'Region',
                        DimensionType.STRING,
                    ),
                },
                metrics: {},
            },
        },
    }) as unknown as Explore;

const input = (
    name: string,
    type: DataAppVizField['type'],
    extra: Partial<DataAppVizField> = {},
): DataAppVizField => ({
    name,
    label: name.toUpperCase(),
    type,
    required: true,
    ...extra,
});

const contextFor = (
    inputs: DataAppVizField[],
    explore = makeExplore(),
): ChartTypeFieldsContext => ({
    prompt: 'Revenue over time by status',
    clarifications: ['Monthly'],
    inputs,
    exploreLabel: explore.label,
    candidates: getChartTypeFieldCandidates(explore),
});

const pick = (
    fieldName: string,
    fieldIds: string[],
    alternatives: string[] = [],
): RawChartTypeFieldSuggestions['suggestions'][number] => ({
    fieldName,
    fieldIds,
    reason: `Reason for ${fieldName}`,
    alternatives: alternatives.map((fieldId) => ({
        fieldId,
        reason: `Alt ${fieldId}`,
    })),
});

describe('getChartTypeFieldCandidates', () => {
    it('lists visible fields with item ids, base table first', () => {
        expect(getChartTypeFieldCandidates(makeExplore())).toEqual([
            expect.objectContaining({
                id: 'orders_order_date',
                kind: 'dimension',
                type: 'date',
            }),
            expect.objectContaining({
                id: 'orders_status',
                kind: 'dimension',
                type: 'string',
            }),
            expect.objectContaining({
                id: 'orders_revenue',
                kind: 'metric',
                type: 'number',
            }),
            expect.objectContaining({ id: 'orders_order_count' }),
            expect.objectContaining({
                id: 'customers_region',
                tableLabel: 'Customers',
            }),
        ]);
    });
});

describe('sanitizeChartTypeFieldSuggestions', () => {
    it('drops ids that are not in the explore', () => {
        const [result] = sanitizeChartTypeFieldSuggestions(
            { suggestions: [pick('x', ['orders_made_up'], ['nope'])] },
            contextFor([input('x', 'dimension')]),
        );
        expect(result.fieldIds).toEqual([]);
        expect(result.alternatives).toEqual([]);
    });

    it('drops hidden fields', () => {
        const [result] = sanitizeChartTypeFieldSuggestions(
            { suggestions: [pick('x', ['orders_secret'])] },
            contextFor([input('x', 'dimension')]),
        );
        expect(result.fieldIds).toEqual([]);
    });

    it('enforces the pool rule for each input type', () => {
        const result = sanitizeChartTypeFieldSuggestions(
            {
                suggestions: [
                    pick('value', ['orders_status'], ['orders_revenue']),
                    pick('x', ['orders_order_count'], ['orders_order_date']),
                    pick('split', ['orders_revenue']),
                    pick('any', ['orders_order_count']),
                ],
            },
            contextFor([
                input('value', 'metric'),
                input('x', 'dimension'),
                input('split', 'series'),
                input('any', 'column'),
            ]),
        );
        expect(result.map((r) => r.fieldIds)).toEqual([
            ['orders_revenue'],
            ['orders_order_date'],
            [],
            ['orders_order_count'],
        ]);
        expect(result[0].reason).toBe('Alt orders_revenue');
    });

    it('keeps an id on the first input that picks it', () => {
        const result = sanitizeChartTypeFieldSuggestions(
            {
                suggestions: [
                    pick('x', ['orders_status']),
                    pick('color', ['orders_status'], ['orders_status']),
                    pick('label', ['customers_region'], ['orders_status']),
                ],
            },
            contextFor([
                input('x', 'dimension'),
                input('color', 'dimension'),
                input('label', 'dimension'),
            ]),
        );
        expect(result.map((r) => r.fieldIds)).toEqual([
            ['orders_status'],
            [],
            ['customers_region'],
        ]);
        expect(result[2].alternatives).toEqual([]);
    });

    it('returns a list for multiple inputs and one id otherwise', () => {
        const result = sanitizeChartTypeFieldSuggestions(
            {
                suggestions: [
                    pick('x', ['orders_order_date', 'orders_status']),
                    pick('values', [
                        'orders_revenue',
                        'orders_order_count',
                        'orders_revenue',
                    ]),
                ],
            },
            contextFor([
                input('x', 'dimension'),
                input('values', 'metric', { multiple: true }),
            ]),
        );
        expect(result.map((r) => r.fieldIds)).toEqual([
            ['orders_order_date'],
            ['orders_revenue', 'orders_order_count'],
        ]);
    });

    it('returns empty fieldIds with a reason when no metric exists', () => {
        const explore = makeExplore(false);
        const [result] = sanitizeChartTypeFieldSuggestions(
            { suggestions: [pick('value', ['orders_status'])] },
            contextFor([input('value', 'metric')], explore),
        );
        expect(result).toEqual({
            fieldName: 'value',
            fieldIds: [],
            reason: 'Orders has no metrics, so nothing fits VALUE.',
            alternatives: [],
        });
    });

    it('returns one entry per requested input in request order', () => {
        const result = sanitizeChartTypeFieldSuggestions(
            {
                suggestions: [
                    pick('y', ['orders_revenue']),
                    pick('unknown', ['orders_status']),
                ],
            },
            contextFor([input('x', 'dimension'), input('y', 'metric')]),
        );
        expect(result.map((r) => r.fieldName)).toEqual(['x', 'y']);
        expect(result[0].fieldIds).toEqual([]);
    });

    it('keeps at most two alternatives', () => {
        const [result] = sanitizeChartTypeFieldSuggestions(
            {
                suggestions: [
                    pick(
                        'x',
                        ['orders_order_date'],
                        ['orders_status', 'customers_region', 'orders_status'],
                    ),
                ],
            },
            contextFor([input('x', 'column')]),
        );
        expect(result.alternatives.map((a) => a.fieldId)).toEqual([
            'orders_status',
            'customers_region',
        ]);
    });
});

describe('prompts', () => {
    it('builds the field suggestion request', () => {
        expect(
            buildChartTypeFieldsPrompt(
                contextFor([
                    input('x', 'dimension', {
                        description: 'Time axis',
                        examples: ['2024-01'],
                    }),
                    input('values', 'metric', { multiple: true }),
                ]),
            ),
        ).toMatchSnapshot();
    });

    it('builds the explore suggestion request', () => {
        expect(
            buildChartTypeExplorePrompt({
                prompt: 'Revenue over time',
                clarifications: [],
                inputs: [input('value', 'metric')],
                candidates: [
                    {
                        name: 'orders',
                        label: 'Orders',
                        description: 'One row per order',
                        groupLabel: null,
                        tags: ['sales'],
                        aiHint: null,
                        fields: [
                            {
                                label: 'Revenue',
                                kind: 'metric',
                                type: 'number',
                            },
                        ],
                    },
                    {
                        name: 'customers',
                        label: 'Customers',
                        description: null,
                        groupLabel: 'CRM',
                        tags: [],
                        aiHint: 'Use for customer questions',
                        fields: null,
                    },
                ],
            }),
        ).toMatchSnapshot();
    });

    it('allows a semantic pick when large projects omit field lists', () => {
        const prompt = buildChartTypeExplorePrompt({
            prompt: 'Clinic visits over time',
            clarifications: [],
            inputs: [input('visit_date', 'dimension')],
            candidates: [
                {
                    name: 'clinic_visits',
                    label: 'Clinic visits',
                    description: null,
                    groupLabel: null,
                    tags: [],
                    aiHint: null,
                    fields: null,
                },
            ],
        });
        expect(prompt.system).toContain('field lists are omitted');
        expect(prompt.system).toContain('validated after your choice');
    });
});

describe('model calls', () => {
    const modelOptions = { model: 'test', keyManagement: null } as never;

    it('sanitizes the field suggestions the model returns', async () => {
        vi.mocked(generateText).mockResolvedValueOnce({
            output: {
                suggestions: [pick('value', ['orders_status', 'nope'])],
            },
            usage: {},
        } as never);
        const result = await suggestChartTypeFields(
            modelOptions,
            contextFor([input('value', 'metric')]),
        );
        expect(result.suggestions[0].fieldIds).toEqual([]);
        expect(vi.mocked(generateText).mock.calls[0][0]).toEqual(
            expect.objectContaining({
                maxRetries: 0,
                maxOutputTokens: 500,
            }),
        );
    });

    it('ignores an explore name that is not a candidate', async () => {
        vi.mocked(generateText).mockResolvedValueOnce({
            output: { exploreName: 'invented', reason: 'x' },
            usage: {},
        } as never);
        expect(
            await suggestChartTypeExplore(modelOptions, {
                prompt: 'p',
                clarifications: [],
                inputs: [],
                candidates: [
                    {
                        name: 'orders',
                        label: 'Orders',
                        description: null,
                        groupLabel: null,
                        tags: [],
                        aiHint: null,
                        fields: null,
                    },
                ],
            }),
        ).toEqual({ suggestion: null, timedOut: false });
    });
    it('resolves an explore answered by its label to its name', async () => {
        vi.mocked(generateText).mockResolvedValueOnce({
            output: { exploreName: 'Orders', reason: ' Orders has revenue. ' },
            usage: {},
        } as never);
        expect(
            await suggestChartTypeExplore(modelOptions, {
                prompt: 'p',
                clarifications: [],
                inputs: [],
                candidates: [
                    {
                        name: 'orders',
                        label: 'Orders',
                        description: null,
                        groupLabel: null,
                        tags: [],
                        aiHint: null,
                        fields: null,
                    },
                ],
            }),
        ).toEqual({
            suggestion: {
                exploreName: 'orders',
                reason: 'Orders has revenue.',
            },
            timedOut: false,
        });
    });
});

describe('model failures', () => {
    const modelOptions = { model: 'test', keyManagement: null } as never;

    it('answers empty when the output cannot be parsed', async () => {
        vi.mocked(generateText).mockRejectedValueOnce(
            new NoObjectGeneratedError({
                message: 'No object generated',
                text: 'not json',
                response: {} as never,
                usage: {} as never,
                finishReason: 'stop',
            }),
        );
        expect(
            await suggestChartTypeFields(
                modelOptions,
                contextFor([input('value', 'metric')]),
            ),
        ).toEqual({
            suggestions: [
                {
                    fieldName: 'value',
                    fieldIds: [],
                    reason: 'No field in Orders clearly fits VALUE.',
                    alternatives: [],
                },
            ],
            timedOut: false,
        });
    });

    it('rethrows provider errors', async () => {
        vi.mocked(generateText).mockRejectedValueOnce(
            new Error('invalid x-api-key'),
        );
        await expect(
            suggestChartTypeFields(
                modelOptions,
                contextFor([input('value', 'metric')]),
            ),
        ).rejects.toThrow('invalid x-api-key');
    });
});

describe('exploreSatisfiesInputs', () => {
    const candidates = (explore: Explore) =>
        getChartTypeFieldCandidates(explore);

    it('needs a metric for a required metric input', () => {
        const withoutMetrics = makeExplore(false);
        expect(
            exploreSatisfiesInputs(
                [input('value', 'metric')],
                candidates(withoutMetrics),
            ),
        ).toBe(false);
        expect(
            exploreSatisfiesInputs(
                [input('value', 'metric', { required: false })],
                candidates(withoutMetrics),
            ),
        ).toBe(true);
        expect(
            exploreSatisfiesInputs(
                [input('value', 'metric'), input('x', 'series')],
                candidates(makeExplore()),
            ),
        ).toBe(true);
    });
});
