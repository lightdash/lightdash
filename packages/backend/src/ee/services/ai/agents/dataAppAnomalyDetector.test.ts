import { generateText } from 'ai';
import { detectDataAppAnomalies, truncateText } from './dataAppAnomalyDetector';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
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

describe('detectDataAppAnomalies', () => {
    beforeEach(() => {
        vi.mocked(generateText).mockResolvedValue({
            output: {
                headline: 'h',
                summary: 's',
                anomalies: [
                    {
                        severity: 'high',
                        text: 't',
                        queryUuid: 'q1',
                        fieldId: 'orders_count',
                        rowIdentity: [
                            { fieldId: 'orders_month', value: '2025-01-01' },
                        ],
                        expected: null,
                        actual: '45',
                    },
                ],
                limitations: [],
                dataAsOf: null,
            },
            usage: {},
        } as never);
    });

    it('tells the model the date and the per-section rules', async () => {
        const result = await detectDataAppAnomalies(modelOptions, {
            content: '## Orders\nQuery: q1\n',
            instructions: null,
            today: '2026-09-16',
        });
        const { messages } = vi.mocked(generateText).mock.calls[0][0] as {
            messages: { role: string; content: string }[];
        };
        expect(messages[0].content).toMatch(/each source section on its own/);
        expect(messages[0].content).toMatch(/largest category.*not a finding/);
        expect(messages[1].content).toMatch(/^Today is 2026-09-16\./);
        expect(result.detection.anomalies[0].dimensionValues).toEqual({
            orders_month: '2025-01-01',
        });
    });

    it('passes author instructions in the user message, and omits the block without them', async () => {
        vi.mocked(generateText).mockClear();
        await detectDataAppAnomalies(modelOptions, {
            content: '## Orders\nQuery: q1\n',
            instructions: 'Write in British English.',
            today: '2026-09-16',
        });
        const { messages } = vi.mocked(generateText).mock.calls[0][0] as {
            messages: { role: string; content: string }[];
        };
        expect(messages[1].content).toContain(
            'Author instructions:\nWrite in British English.',
        );

        vi.mocked(generateText).mockClear();
        await detectDataAppAnomalies(modelOptions, {
            content: '## Orders\nQuery: q1\n',
            instructions: null,
            today: '2026-09-16',
        });
        const { messages: bare } = vi.mocked(generateText).mock.calls[0][0] as {
            messages: { role: string; content: string }[];
        };
        expect(bare[1].content).not.toContain('Author instructions');
    });

    it('tells the model that recurring seasonality is baseline, not an anomaly', async () => {
        await detectDataAppAnomalies(modelOptions, {
            content: '## Orders\nQuery: q1\n',
            instructions: null,
            today: '2026-09-16',
        });
        const { messages } = vi.mocked(generateText).mock.calls[0][0] as {
            messages: { role: string; content: string }[];
        };
        const system = messages[0].content;
        // Daily data: like-for-like weekday comparison, not calendar neighbours.
        expect(system).toMatch(
            /same weekday in (earlier|prior|previous) weeks/,
        );
        // A pattern repeating every cycle is baseline.
        expect(system).toMatch(/repeats every (week|cycle).*baseline/);
        // Flag only a break of its own like-for-like baseline.
        expect(system).toMatch(
            /own (recent )?(weekday|like-for-like) baseline/,
        );
    });

    it('keeps an over-long response instead of rejecting it, trimmed to the limits', async () => {
        const long = (n: number) => 'word '.repeat(n);
        vi.mocked(generateText).mockResolvedValueOnce({
            output: {
                headline: long(60),
                summary: long(300),
                anomalies: Array.from({ length: 15 }, (_, i) => ({
                    severity: 'high',
                    text: long(100),
                    queryUuid: `q${i}`,
                    fieldId: 'orders_count',
                    rowIdentity: [],
                    expected: null,
                    actual: '1',
                })),
                limitations: Array.from({ length: 10 }, () => long(80)),
                dataAsOf: null,
            },
            usage: {},
        } as never);
        const { detection } = await detectDataAppAnomalies(modelOptions, {
            content: '## Orders\nQuery: q1\n',
            instructions: null,
            today: '2026-09-16',
        });
        expect(detection.headline.length).toBeLessThanOrEqual(200);
        expect(detection.headline.endsWith('…')).toBe(true);
        expect(detection.summary.length).toBeLessThanOrEqual(1200);
        expect(detection.anomalies).toHaveLength(12);
        expect(detection.anomalies[0].queryUuid).toBe('q0');
        expect(detection.anomalies[0].text.length).toBeLessThanOrEqual(400);
        expect(detection.limitations).toHaveLength(8);
        expect(detection.limitations.every((l) => l.length <= 300)).toBe(true);
    });
});

describe('truncateText', () => {
    it('leaves text within the limit untouched', () => {
        expect(truncateText('short headline', 200)).toBe('short headline');
    });

    it('cuts at a word boundary and adds an ellipsis', () => {
        expect(truncateText('one two three four', 12)).toBe('one two…');
    });

    it('hard-cuts a single long word', () => {
        expect(truncateText('a'.repeat(20), 10)).toBe(`${'a'.repeat(9)}…`);
    });
});
