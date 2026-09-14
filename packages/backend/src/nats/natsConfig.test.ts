import { describe, expect, it } from 'vitest';
import {
    getDuckdbQuerySubject,
    registerPreAggregateStream,
    STREAM_CONFIGS,
} from './natsConfig';

describe('getDuckdbQuerySubject', () => {
    it('publishes to the dedicated DuckDB stream without a pre-aggregate stream', () => {
        expect(STREAM_CONFIGS['pre-aggregate']).toBeUndefined();
        expect(getDuckdbQuerySubject()).toBe('duckdb.query.jobs');
    });

    it('rides the pre-aggregate stream once it is registered', () => {
        registerPreAggregateStream();

        expect(getDuckdbQuerySubject()).toBe('pre_aggregate.duckdb.jobs');
        // The subject is on the stream, so its worker's consumer filter takes it
        expect(
            Object.values(STREAM_CONFIGS['pre-aggregate'].subjects),
        ).toContain('pre_aggregate.duckdb.jobs');
    });
});
