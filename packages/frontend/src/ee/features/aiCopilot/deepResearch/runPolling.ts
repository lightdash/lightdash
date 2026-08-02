import { type AiDeepResearchRun } from '@lightdash/common';
import { isDeepResearchRunTerminal } from './runProgress';

export const DEEP_RESEARCH_TERMINAL_REFETCH_MAX_MS = 24 * 60 * 60 * 1_000;

export const getDeepResearchRunRefetchInterval = (
    run:
        | Pick<
              AiDeepResearchRun,
              'status' | 'isReportExpired' | 'reportExpiresAt'
          >
        | undefined,
    activePollIntervalMs: number,
    nowMs = Date.now(),
): number | false => {
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
