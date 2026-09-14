import { generateObject } from 'ai';
import { llmAsAJudge } from './llmAsAJudge';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateObject: vi.fn(),
}));

const mockedGenerateObject = vi.mocked(generateObject);

describe('llmAsAJudge context relevancy', () => {
    it('does not require chart context to contain computed result values', async () => {
        mockedGenerateObject.mockResolvedValue({
            object: {
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
