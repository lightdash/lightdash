import { aiAgentReviewRunAt } from './SchedulerClient';

describe('aiAgentReviewRunAt', () => {
    const now = new Date('2026-06-04T11:33:48.000Z');

    it('defers feedback_changed reviews so a rate-then-comment pair coalesces', () => {
        const runAt = aiAgentReviewRunAt('feedback_changed', now);
        // Delayed by the debounce window so the shared jobKey can replace the
        // still-pending job when the comment arrives shortly after the rating.
        expect(runAt.getTime() - now.getTime()).toBe(60_000);
    });

    it('runs response_saved reviews immediately', () => {
        const runAt = aiAgentReviewRunAt('response_saved', now);
        expect(runAt.getTime()).toBe(now.getTime());
    });
});
