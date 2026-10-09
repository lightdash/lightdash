import { generateText } from 'ai';
import { detectDataAppAnomalies } from './dataAppAnomalyDetector';

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
});
