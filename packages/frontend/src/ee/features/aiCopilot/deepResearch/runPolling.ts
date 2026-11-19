import { type AiDeepResearchRun, type ApiError } from '@lightdash/common';
import { isDeepResearchRunTerminal } from './runProgress';

const DEEP_RESEARCH_ERROR_REFETCH_MAX_MS = 30_000;

type PollFailure = {
    error: ApiError;
    failureCount: number;
};

export const getDeepResearchRunRefetchInterval = (
    run: Pick<AiDeepResearchRun, 'status'> | undefined,
    activePollIntervalMs: number,
    failure?: PollFailure,
): number | false => {
    const statusCode = failure?.error.error?.statusCode;
    if (statusCode === 403 || statusCode === 404) {
        return false;
    }
    if (failure) {
        return Math.min(
            activePollIntervalMs * 2 ** failure.failureCount,
            DEEP_RESEARCH_ERROR_REFETCH_MAX_MS,
        );
    }
    if (!run || !isDeepResearchRunTerminal(run.status)) {
        return activePollIntervalMs;
    }
    return false;
};
