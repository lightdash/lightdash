import type {
    QueryErrorEvent,
    QueryExecutionEvent,
    QueryReadyEvent,
} from '../LightdashAnalytics';
import type { ProjectionResult } from './projection';
import { queryEventsProjections } from './queryEventsStream';

/**
 * Union of every analytics event projected into a usage event stream.
 * Adding a new stream/event = add the event type here and a projection entry
 * below; nothing else needs to change.
 */
export type ProjectedEvent =
    | QueryExecutionEvent
    | QueryReadyEvent
    | QueryErrorEvent;

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
