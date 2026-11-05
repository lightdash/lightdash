export const QUERY_HISTORY_BACKFILL_EVENT = 'query.history_backfilled';

export const queryHistoryBackfillKey = (org: string) =>
    `events/compacted/org_id=${org}/history=query_events/history.parquet`;
