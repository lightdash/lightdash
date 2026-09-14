import {
    QueryHistoryStatus,
    type QueryHistoryListItem,
} from '@lightdash/common';
import dayjs from 'dayjs';

export type QueryTimings = {
    totalMs: number | null;
    queuedMs: number | null;
    warehouseMs: number | null;
    fetchMs: number | null;
};

/**
 * Queued/warehouse/fetch add up to the total: time before the worker picked
 * the job up, time in the warehouse, and everything after (writing + serving
 * the results file).
 *
 * A cache hit copies the cached file's timestamps onto this run, so
 * `resultsUpdatedAt` predates `createdAt` and can't end it — such a run has no
 * recorded finish time and its total is unknown.
 */
export const getQueryTimings = (item: QueryHistoryListItem): QueryTimings => {
    const endedAt =
        item.status === QueryHistoryStatus.ERROR
            ? item.erroredAt
            : item.resultsUpdatedAt;
    const elapsedMs = endedAt
        ? dayjs(endedAt).diff(dayjs(item.createdAt))
        : null;
    const totalMs = elapsedMs !== null && elapsedMs >= 0 ? elapsedMs : null;
    const queuedMs = item.processingStartedAt
        ? Math.max(
              dayjs(item.processingStartedAt).diff(dayjs(item.createdAt)),
              0,
          )
        : null;
    const warehouseMs = item.warehouseExecutionTimeMs;
    const fetchMs =
        totalMs !== null && queuedMs !== null && warehouseMs !== null
            ? Math.max(totalMs - queuedMs - warehouseMs, 0)
            : null;
    return { totalMs, queuedMs, warehouseMs, fetchMs };
};
