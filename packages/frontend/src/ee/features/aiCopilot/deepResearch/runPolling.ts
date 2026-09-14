import { type AiDeepResearchRun, type ApiError } from '@lightdash/common';
import { isDeepResearchRunTerminal } from './runProgress';

export const DEEP_RESEARCH_TERMINAL_REFETCH_MAX_MS = 24 * 60 * 60 * 1_000;
const DEEP_RESEARCH_ERROR_REFETCH_MAX_MS = 30_000;

type PollFailure = {
    error: ApiError;
    failureCount: number;
};

export const getDeepResearchRunRefetchInterval = (
    run:
        | Pick<
              AiDeepResearchRun,
              'status' | 'isReportExpired' | 'reportExpiresAt'
          >
        | undefined,
    activePollIntervalMs: number,
    nowMs = Date.now(),
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
    if (run.isReportExpired || !run.reportExpiresAt) {
        return false;
    }
    const untilExpiry = new Date(run.reportExpiresAt).getTime() - nowMs;
    return Math.min(
        Math.max(untilExpiry, 1_000),
        DEEP_RESEARCH_TERMINAL_REFETCH_MAX_MS,
    );
};
