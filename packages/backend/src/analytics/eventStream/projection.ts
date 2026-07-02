import type { BaseTrack } from '../LightdashAnalytics';
import { EventStreamRow } from './types';

export const EVENT_STREAM_SCHEMA_VERSION = 1;

export type StreamName = 'query_events';

/**
 * Common envelope stamped on every row pushed into the usage event stream.
 */
export type EventStreamEnvelope = {
    event_name: string;
    org_id: string;
    user_id: string | null;
    event_ts: string;
    schema_version: number;
};

export type ProjectionResult = {
    stream: StreamName;
    row: EventStreamRow;
} | null;

export const buildEnvelope = (
    payload: BaseTrack,
    orgId: string,
): EventStreamEnvelope => ({
    event_name: payload.event,
    org_id: orgId,
    user_id: payload.userId ?? null,
    event_ts: new Date().toISOString(),
    schema_version: EVENT_STREAM_SCHEMA_VERSION,
});
