/**
 * Minimal row contract for the usage-analytics raw event stream. Sinks build
 * typed rows on top of this shape.
 */
export type EventStreamRow = {
    org_id: string;
    event_ts: string;
    [key: string]: unknown;
};

export interface EventStreamWriter {
    push(streamName: string, row: EventStreamRow): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
