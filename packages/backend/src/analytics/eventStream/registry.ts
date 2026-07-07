import type { QueryCompletedEvent } from '../LightdashAnalytics';
import type { ProjectionResult, StreamName } from './projection';
import {
    queryEventsCompactedColumns,
    queryEventsProjections,
} from './queryEventsStream';
import type { CompactedStreamColumn } from './types';

/**
 * Union of every analytics event projected into a usage event stream.
 * Adding a new stream/event = add the event type here and a projection entry
 * below; nothing else needs to change.
 */
export type ProjectedEvent = QueryCompletedEvent;

export type EventStreamRegistry = {
    [E in ProjectedEvent as E['event']]: (payload: E) => ProjectionResult;
};

/**
 * Allowlist of analytics events pushed into the usage event stream. Events
 * not present here are ignored by the sink.
 */
export const eventStreamRegistry: EventStreamRegistry = {
    ...queryEventsProjections,
};

/**
 * Typed parquet schema per stream, used by the nightly compaction job.
 * Streams found in the raw zone without an entry here are skipped (their raw
 * files are never deleted).
 */
export const compactedStreamSchemas: Record<
    StreamName,
    CompactedStreamColumn[]
> = {
    query_events: queryEventsCompactedColumns,
};

export const getCompactedStreamColumns = (
    stream: string,
): CompactedStreamColumn[] | null =>
    stream in compactedStreamSchemas
        ? compactedStreamSchemas[stream as StreamName]
        : null;
