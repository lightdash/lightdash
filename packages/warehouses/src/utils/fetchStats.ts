import type { WarehouseFetchStats } from '@lightdash/common';

export const FETCH_STATS_SAMPLE_SIZE = 1024;

type FetchDurationField = 'waitMs' | 'processMs' | 'sdkConvertMs' | 'writeMs';

export type FetchStatsRecorder = {
    recordPage(requestMs: number, rows: number, approxBytes: number): void;
    add(field: FetchDurationField, durationMs: number): void;
    summary(): WarehouseFetchStats;
};

export function createFetchStats(
    random: () => number = Math.random,
): FetchStatsRecorder {
    const requestSamples: number[] = [];
    const totals: WarehouseFetchStats = {
        pages: 0,
        rows: 0,
        approxResponseBytes: 0,
        requestTotalMs: 0,
        requestP50Ms: 0,
        requestMaxMs: 0,
        waitMs: 0,
        processMs: 0,
        sdkConvertMs: 0,
        writeMs: 0,
    };
    return {
        recordPage(requestMs, rows, approxBytes) {
            totals.pages += 1;
            totals.rows += rows;
            totals.approxResponseBytes += approxBytes;
            totals.requestTotalMs += requestMs;
            totals.requestMaxMs = Math.max(totals.requestMaxMs, requestMs);
            if (requestSamples.length < FETCH_STATS_SAMPLE_SIZE) {
                requestSamples.push(requestMs);
                return;
            }
            const slot = Math.floor(random() * totals.pages);
            if (slot < FETCH_STATS_SAMPLE_SIZE)
                requestSamples[slot] = requestMs;
        },
        add(field, durationMs) {
            totals[field] += durationMs;
        },
        summary() {
            const sorted = [...requestSamples].sort((a, b) => a - b);
            return {
                ...totals,
                requestP50Ms:
                    sorted.length > 0
                        ? sorted[Math.floor((sorted.length - 1) / 2)]
                        : 0,
            };
        },
    };
}
