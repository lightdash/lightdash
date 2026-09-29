import { generateText } from 'ai';
import { registerAiUsageTracker } from '../../../../analytics/aiUsage';
import { llmAsAJudge } from './llmAsAJudge';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const mockedGenerateObject = vi.mocked(generateText);

describe('llmAsAJudge context relevancy', () => {
    it('does not require chart context to contain computed result values', async () => {
        mockedGenerateObject.mockResolvedValue({
            output: {
                score: 0.8,
                reason: 'The chart configuration is relevant to the query.',
            },
            usage: undefined,
        } as never);

        await llmAsAJudge({
            query: 'What was the average metric last week?',
            response: 'The average metric was 42.5 units.',
            context: [
                'Artifact type: chart',
                'Chart config: {"metric":"average_metric","period":"last_week"}',
            ],
            judge: {
                provider: 'test-provider',
                modelId: 'test-model',
            } as never,
            callOptions: {},
            keyManagement: 'lightdash-managed',
            scorerType: 'contextRelevancy',
        });

        expect(mockedGenerateObject).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: expect.stringContaining(
                    'When the context includes a chart artifact and configuration that identifies the requested metric and applicable dimensions, filters, and time range, missing computed result rows alone must not lower the relevancy score or require independently verifying the response',
                ),
            }),
        );
    });
});

describe('llmAsAJudge key origin', () => {
    const track = vi.fn();
    const judgeParams = {
        query: 'How many orders last week?',
        response: '120 orders.',
        judge: {
            provider: 'test-provider',
            modelId: 'test-model',
        } as never,
        callOptions: {},
        keyManagement: 'lightdash-managed' as const,
        telemetry: { organizationUuid: 'org-1' },
    };
    const usage = { inputTokens: 40, outputTokens: 5, totalTokens: 45 };

    beforeEach(() => {
        track.mockClear();
        registerAiUsageTracker(track);
    });

    afterEach(() => {
        registerAiUsageTracker(() => {});
    });

    it('reports the key origin of the judge model on factuality usage', async () => {
        mockedGenerateObject.mockResolvedValue({
            output: { answer: 'C', rationale: 'Same facts.' },
            usage,
        } as never);

        await llmAsAJudge({
            ...judgeParams,
            expectedAnswer: '120',
            scorerType: 'factuality',
        });

        expect(track.mock.calls[0][0].properties).toMatchObject({
            feature: 'llm-judge',
            keyManagement: 'lightdash-managed',
        });
    });

    it('reports the key origin of the judge model on context relevancy usage', async () => {
        mockedGenerateObject.mockResolvedValue({
            output: { score: 1, reason: 'The context holds the count.' },
            usage,
        } as never);

        await llmAsAJudge({
            ...judgeParams,
            context: ['Orders last week: 120'],
            scorerType: 'contextRelevancy',
        });

        expect(track.mock.calls[0][0].properties).toMatchObject({
            feature: 'llm-judge',
            keyManagement: 'lightdash-managed',
        });
    });
});
