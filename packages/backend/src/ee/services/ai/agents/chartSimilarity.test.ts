import { generateObject } from 'ai';
import {
    chartSimilaritySchema,
    compareChartQueries,
    sanitizeChartSimilarity,
    type ChartSimilarityInput,
} from './chartSimilarity';

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('../../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));

const input: ChartSimilarityInput = {
    source: {
        name: 'Revenue',
        metricQuery: {
            exploreName: 'orders',
            metrics: ['orders_revenue'],
            dimensions: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
    },
    candidates: [],
};

const withCandidates = (ids: string[]): ChartSimilarityInput => ({
    ...input,
    candidates: ids.map((uuid) => ({ ...input.source, uuid })),
});

it('rejects hallucinated IDs and duplicate verdicts and ranks potential duplicates first', () => {
    const matches = sanitizeChartSimilarity(
        [
            {
                uuid: 'made-up',
                relationship: 'potential_duplicate',
                explanation: 'Invented',
            },
            {
                uuid: 'related',
                relationship: 'related',
                explanation: 'Different grain',
            },
            {
                uuid: 'duplicate',
                relationship: 'potential_duplicate',
                explanation: 'Same query',
            },
            {
                uuid: 'duplicate',
                relationship: 'related',
                explanation: 'Repeat',
            },
            {
                uuid: 'unrelated',
                relationship: 'unrelated',
                explanation: 'Different metric',
            },
            {
                uuid: 'unrelated',
                relationship: 'potential_duplicate',
                explanation: 'Repeat',
            },
        ],
        withCandidates(['related', 'duplicate', 'unrelated']),
    );
    expect(matches.map((match) => match.uuid)).toEqual([
        'duplicate',
        'related',
    ]);
});

it('caps displayed matches at five', () => {
    const matches = Array.from({ length: 12 }, (_, i) => ({
        uuid: `${i}`,
        relationship: 'related' as const,
        explanation: 'Related',
    }));
    expect(
        sanitizeChartSimilarity(
            matches,
            withCandidates(matches.map((m) => m.uuid)),
        ),
    ).toHaveLength(5);
});

it.each([
    {
        uuid: 'one',
        relationship: 'identical',
        explanation: 'Invalid classification',
    },
    { uuid: 'one', relationship: 'related', explanation: '' },
    { uuid: 'one', relationship: 'related', explanation: 'x'.repeat(1001) },
])('rejects invalid structured output: %j', (match) => {
    expect(chartSimilaritySchema.safeParse({ matches: [match] }).success).toBe(
        false,
    );
});

it('does not silently truncate a query or send an oversized prompt', async () => {
    vi.mocked(generateObject).mockClear();
    await expect(
        compareChartQueries(
            { model: 'test', keyManagement: null },
            {
                ...input,
                source: { ...input.source, name: 'x'.repeat(100_001) },
            },
        ),
    ).rejects.toThrow('budget');
    expect(generateObject).not.toHaveBeenCalled();
});

it('bounds the model call, preserves query details, and sanitizes its result', async () => {
    vi.mocked(generateObject).mockResolvedValue({
        object: {
            matches: [
                {
                    uuid: 'unknown',
                    relationship: 'related',
                    explanation: 'Invented',
                },
            ],
        },
        usage: {},
    } as never);
    const result = await compareChartQueries(
        { model: 'test', keyManagement: null },
        input,
    );
    expect(result).toEqual([]);
    expect(generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
            maxRetries: 0,
            maxOutputTokens: 1500,
            abortSignal: expect.any(AbortSignal),
            prompt: JSON.stringify(input),
        }),
    );
});

it('rejects relevance invented from a misleading name with no shared query fields', () => {
    const candidate = {
        ...input.source,
        uuid: 'misleading',
        metricQuery: {
            ...input.source.metricQuery,
            metrics: ['customers_count'],
        },
    };
    expect(
        sanitizeChartSimilarity(
            [
                {
                    uuid: 'misleading',
                    relationship: 'related',
                    explanation: 'Both measure revenue',
                },
            ],
            { ...input, candidates: [candidate] },
        ),
    ).toEqual([]);
});

it('bounds a verbose explanation without discarding the useful match', () => {
    const matches = sanitizeChartSimilarity(
        [
            {
                uuid: 'one',
                relationship: 'related',
                explanation: 'x'.repeat(300),
            },
        ],
        withCandidates(['one']),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].explanation.length).toBeLessThanOrEqual(240);
});

it.each([
    { limit: 1 },
    { dimensions: ['orders_month'] },
    { timezone: 'UTC' },
    { sorts: [{ fieldId: 'orders_revenue', descending: true }] },
    {
        tableCalculations: [
            { name: 'ratio', displayName: 'Ratio', sql: '1 / 2' },
        ],
    },
    {
        filters: {
            dimensions: {
                id: 'filter-group',
                and: [
                    {
                        id: 'filter',
                        target: { fieldId: 'orders_method' },
                        operator: 'equals',
                        values: ['Air'],
                    },
                ],
            },
        },
    },
])(
    'downgrades an AI duplicate verdict when query settings differ: %j',
    (change) => {
        const context = withCandidates(['one']);
        context.candidates[0].metricQuery = {
            ...input.source.metricQuery,
            ...change,
        } as typeof input.source.metricQuery;
        const result = sanitizeChartSimilarity(
            [
                {
                    uuid: 'one',
                    relationship: 'potential_duplicate',
                    explanation: 'Same query',
                },
            ],
            context,
        );
        expect(result[0].relationship).toBe('related');
        expect(result[0].explanation).toBe(
            'Query settings differ. Compare the charts before reusing.',
        );
    },
);

it('downgrades a duplicate verdict when parameters differ', () => {
    const context = withCandidates(['one']);
    context.candidates[0].parameters = { period: 'last_year' };
    expect(
        sanitizeChartSimilarity(
            [
                {
                    uuid: 'one',
                    relationship: 'potential_duplicate',
                    explanation: 'Same metric',
                },
            ],
            context,
        )[0].relationship,
    ).toBe('related');
});

it('treats omitted and undefined optional properties as the same query', () => {
    const context = withCandidates(['one']);
    context.candidates[0].metricQuery = {
        ...context.candidates[0].metricQuery,
        customDimensions: undefined,
    };
    expect(
        sanitizeChartSimilarity(
            [
                {
                    uuid: 'one',
                    relationship: 'potential_duplicate',
                    explanation: 'Same query',
                },
            ],
            context,
        )[0].relationship,
    ).toBe('potential_duplicate');
});
