import { shouldEnqueueReviewClassifierForPromptUpdate } from './AiAgentService';

describe('shouldEnqueueReviewClassifierForPromptUpdate', () => {
    it('does not enqueue for an intermediate non-streaming response', () => {
        expect(
            shouldEnqueueReviewClassifierForPromptUpdate({
                promptUuid: 'prompt-1',
                response: 'Draft response',
            }),
        ).toBe(false);
    });

    it('enqueues once the final response includes token usage', () => {
        expect(
            shouldEnqueueReviewClassifierForPromptUpdate({
                promptUuid: 'prompt-1',
                response: 'Final response',
                tokenUsage: { totalTokens: 123 },
            }),
        ).toBe(true);
    });

    it('enqueues failed responses', () => {
        expect(
            shouldEnqueueReviewClassifierForPromptUpdate({
                promptUuid: 'prompt-1',
                errorMessage: 'Provider failed',
            }),
        ).toBe(true);
    });
});
