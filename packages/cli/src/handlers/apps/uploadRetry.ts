import { LightdashError } from '@lightdash/common';

export const APP_BUILD_WAIT_BUDGET_MS = 10 * 60 * 1000;
export const APP_BUILD_WAIT_INITIAL_DELAY_MS = 5 * 1000;
export const APP_BUILD_WAIT_MAX_DELAY_MS = 30 * 1000;

/**
 * Shared wait budget for one upload run. Only time spent sleeping on the
 * build cap is deducted, and every accepted upload refills it — so the budget
 * bounds consecutive unproductive waiting (a stuck build queue), not the
 * total duration of a large healthy run. Once exhausted, remaining apps fail
 * fast on 429 exactly as they did before retries existed.
 */
export type BuildLimitWaitState = {
    remainingMs: () => number;
    spend: (ms: number) => void;
    refill: () => void;
};

export const createBuildLimitWaitState = (
    budgetMs: number = APP_BUILD_WAIT_BUDGET_MS,
): BuildLimitWaitState => {
    let remainingMs = budgetMs;
    return {
        remainingMs: () => remainingMs,
        spend: (ms: number) => {
            remainingMs -= ms;
        },
        refill: () => {
            remainingMs = budgetMs;
        },
    };
};

export const isBuildLimitError = (err: unknown): boolean =>
    err instanceof LightdashError && err.statusCode === 429;

const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * Runs `post` and, when the server rejects it with the per-project build cap
 * (HTTP 429), retries with capped exponential backoff until the shared wait
 * budget runs out. Builds take minutes, so slots free up slowly — the backoff
 * settles on a slow poll rather than hammering the endpoint. Any other error,
 * or a 429 after the budget is spent, is rethrown to the caller's normal
 * failure handling.
 */
export const withBuildLimitRetry = async <T>(
    post: () => Promise<T>,
    waitState: BuildLimitWaitState,
    opts: {
        onWait: (attempt: number, delayMs: number) => void;
        initialDelayMs?: number;
        maxDelayMs?: number;
        sleep?: (ms: number) => Promise<void>;
    },
): Promise<T> => {
    const maxDelayMs = opts.maxDelayMs ?? APP_BUILD_WAIT_MAX_DELAY_MS;
    const sleep = opts.sleep ?? defaultSleep;
    let delayMs = opts.initialDelayMs ?? APP_BUILD_WAIT_INITIAL_DELAY_MS;
    let attempt = 0;
    for (;;) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const result = await post();
            waitState.refill();
            return result;
        } catch (err) {
            if (!isBuildLimitError(err) || waitState.remainingMs() <= 0) {
                throw err;
            }
            attempt += 1;
            const waitMs = Math.min(delayMs, waitState.remainingMs());
            opts.onWait(attempt, waitMs);
            // eslint-disable-next-line no-await-in-loop
            await sleep(waitMs);
            waitState.spend(waitMs);
            delayMs = Math.min(delayMs * 2, maxDelayMs);
        }
    }
};
