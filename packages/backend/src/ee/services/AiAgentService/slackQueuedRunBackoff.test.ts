import {
    getSlackQueuedRunRetryDelayMs,
    V3_SLACK_DEFERRED_RUN_DELAY_MS,
    V3_SLACK_DEFERRED_RUN_GRACE_MS,
    V3_SLACK_QUEUED_RUN_MAX_DELAY_MS,
    V3_SLACK_QUEUED_RUN_MIN_DELAY_MS,
    V3_SLACK_QUEUED_RUN_TIMEOUT_MS,
} from './slackQueuedRunBackoff';

describe('getSlackQueuedRunRetryDelayMs', () => {
    it('polls tightly while a deferred run is inside the grace period', () => {
        expect(
            getSlackQueuedRunRetryDelayMs({ state: 'deferred', waitedMs: 0 }),
        ).toBe(V3_SLACK_DEFERRED_RUN_DELAY_MS);
        expect(
            getSlackQueuedRunRetryDelayMs({
                state: 'deferred',
                waitedMs: V3_SLACK_DEFERRED_RUN_GRACE_MS - 1,
            }),
        ).toBe(V3_SLACK_DEFERRED_RUN_DELAY_MS);
    });

    it('backs off a deferred run once it is past the grace period', () => {
        expect(
            getSlackQueuedRunRetryDelayMs({
                state: 'deferred',
                waitedMs: V3_SLACK_DEFERRED_RUN_GRACE_MS,
            }),
        ).toBe(V3_SLACK_QUEUED_RUN_MAX_DELAY_MS);
    });

    it('clamps a blocked run to the minimum delay while it has barely waited', () => {
        expect(
            getSlackQueuedRunRetryDelayMs({ state: 'blocked', waitedMs: 0 }),
        ).toBe(V3_SLACK_QUEUED_RUN_MIN_DELAY_MS);
        expect(
            getSlackQueuedRunRetryDelayMs({ state: 'blocked', waitedMs: 500 }),
        ).toBe(V3_SLACK_QUEUED_RUN_MIN_DELAY_MS);
    });

    it('doubles the total wait every cycle for a blocked run', () => {
        // Each delay equals the wait so far, so the next wait is twice this one.
        let waitedMs = V3_SLACK_QUEUED_RUN_MIN_DELAY_MS;
        const delays = [1, 2, 3].map(() => {
            const delay = getSlackQueuedRunRetryDelayMs({
                state: 'blocked',
                waitedMs,
            });
            waitedMs += delay ?? 0;
            return delay;
        });
        expect(delays).toEqual([1_000, 2_000, 4_000]);
        expect(waitedMs).toBe(8_000);
    });

    it('caps the delay at the maximum', () => {
        expect(
            getSlackQueuedRunRetryDelayMs({
                state: 'blocked',
                waitedMs: V3_SLACK_QUEUED_RUN_MAX_DELAY_MS,
            }),
        ).toBe(V3_SLACK_QUEUED_RUN_MAX_DELAY_MS);
        expect(
            getSlackQueuedRunRetryDelayMs({
                state: 'blocked',
                waitedMs: V3_SLACK_QUEUED_RUN_TIMEOUT_MS - 1,
            }),
        ).toBe(V3_SLACK_QUEUED_RUN_MAX_DELAY_MS);
    });

    it('returns null once the hard deadline is reached', () => {
        expect(
            getSlackQueuedRunRetryDelayMs({
                state: 'blocked',
                waitedMs: V3_SLACK_QUEUED_RUN_TIMEOUT_MS,
            }),
        ).toBeNull();
        expect(
            getSlackQueuedRunRetryDelayMs({
                state: 'deferred',
                waitedMs: V3_SLACK_QUEUED_RUN_TIMEOUT_MS,
            }),
        ).toBeNull();
    });
});
