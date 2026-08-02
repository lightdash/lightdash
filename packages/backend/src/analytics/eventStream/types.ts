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

/**
 * DuckDB types allowed in compacted (parquet) stream schemas. Each stream
 * declares its typed column list next to its projections so schema and cast
 * stay together.
 */
export type CompactedColumnType =
    | 'VARCHAR'
    | 'TIMESTAMP'
    | 'BOOLEAN'
    | 'INTEGER'
    | 'BIGINT';

export type CompactedStreamColumn = {
    name: string;
    type: CompactedColumnType;
};
