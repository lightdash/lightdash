export type SlackQueuedRunState = 'blocked' | 'deferred';

// The previous run is queued but never claimed a worker; that clears within a
// job cycle, so poll tightly for a short grace period.
export const V3_SLACK_DEFERRED_RUN_DELAY_MS = 1_000;
export const V3_SLACK_DEFERRED_RUN_GRACE_MS = 30_000;

// The previous run is alive and heartbeating, so it can legitimately hold the
// thread for the whole length of an agent turn. Each requeue costs a full
// thread/agent/ability round-trip, so the delay tracks how long this prompt has
// already waited — which doubles it every cycle — up to a cap.
export const V3_SLACK_QUEUED_RUN_MIN_DELAY_MS = 1_000;
export const V3_SLACK_QUEUED_RUN_MAX_DELAY_MS = 30_000;
export const V3_SLACK_QUEUED_RUN_TIMEOUT_MS = 15 * 60 * 1_000;

/**
 * Delay before re-enqueueing a Slack prompt whose thread is still busy, or
 * `null` once the prompt has waited past the hard deadline and should fail.
 */
export const getSlackQueuedRunRetryDelayMs = ({
    state,
    waitedMs,
}: {
    state: SlackQueuedRunState;
    waitedMs: number;
}): number | null => {
    if (waitedMs >= V3_SLACK_QUEUED_RUN_TIMEOUT_MS) return null;
    if (state === 'deferred' && waitedMs < V3_SLACK_DEFERRED_RUN_GRACE_MS) {
        return V3_SLACK_DEFERRED_RUN_DELAY_MS;
    }
    return Math.min(
        Math.max(waitedMs, V3_SLACK_QUEUED_RUN_MIN_DELAY_MS),
        V3_SLACK_QUEUED_RUN_MAX_DELAY_MS,
    );
};
