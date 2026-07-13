import { EE_SCHEDULER_TASKS } from './schedulerTaskList';

test('SEND_REVIEW_NOTIFICATION task is registered', () => {
    expect(EE_SCHEDULER_TASKS.SEND_REVIEW_NOTIFICATION).toBe(
        'sendReviewNotification',
    );
});

test('AI_DEEP_RESEARCH tasks are registered', () => {
    expect(EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH).toBe('aiDeepResearch');
    expect(EE_SCHEDULER_TASKS.SWEEP_STALE_AI_DEEP_RESEARCH_RUNS).toBe(
        'sweepStaleAiDeepResearchRuns',
    );
});
