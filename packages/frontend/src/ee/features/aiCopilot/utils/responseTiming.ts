import type { AiPromptResponseTiming } from '@lightdash/common';

export type ResponseTimingMetrics = {
    ttftMs: number | null;
    totalMs: number;
};

export const getResponseTimingMetrics = (
    timing: AiPromptResponseTiming,
): ResponseTimingMetrics | null => {
    const startedAt = Date.parse(timing.startedAt);
    const finishedAt = Date.parse(timing.finishedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) return null;

    const firstTokenAt =
        timing.firstTokenAt === null ? null : Date.parse(timing.firstTokenAt);
    return {
        ttftMs:
            firstTokenAt === null || Number.isNaN(firstTokenAt)
                ? null
                : firstTokenAt - startedAt,
        totalMs: finishedAt - startedAt,
    };
};

export const formatDurationMs = (ms: number): string => {
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
};
