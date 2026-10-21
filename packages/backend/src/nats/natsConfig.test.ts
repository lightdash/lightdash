import { describe, expect, it } from 'vitest';
import {
    getDuckdbQuerySubject,
    getLegacyStreamArgs,
    getRegisteredStreams,
    registerPreAggregateStream,
    STREAM_CONFIGS,
} from './natsConfig';

describe('registered streams', () => {
    it('registers the OSS streams before any enterprise setup', () => {
        expect(STREAM_CONFIGS['pre-aggregate']).toBeUndefined();
        expect(getRegisteredStreams()).toEqual(['warehouse', 'duckdb']);
    });

    it('publishes DuckDB queries on their own stream', () => {
        expect(getDuckdbQuerySubject()).toBe('duckdb.query.jobs');
    });

    it('adds the pre-aggregate stream once a licence registers it', () => {
        registerPreAggregateStream();

        expect(getRegisteredStreams()).toEqual([
            'warehouse',
            'pre-aggregate',
            'duckdb',
        ]);
    });

    it('keeps DuckDB queries on their own stream with pre-aggregates on', () => {
        registerPreAggregateStream();

        expect(getDuckdbQuerySubject()).toBe('duckdb.query.jobs');
        // Still consumed, so a job an older API pod published mid-upgrade runs
        expect(
            Object.values(STREAM_CONFIGS['pre-aggregate'].subjects),
        ).toContain('pre_aggregate.duckdb.jobs');
    });
});

describe('getLegacyStreamArgs', () => {
    it('returns nothing for a worker started without arguments', () => {
        expect(getLegacyStreamArgs([])).toEqual([]);
    });

    it('collects every value passed to the retired --stream flag', () => {
        expect(
            getLegacyStreamArgs([
                '--stream',
                'warehouse',
                '--stream',
                'pre-aggregate',
            ]),
        ).toEqual(['warehouse', 'pre-aggregate']);
    });

    it('ignores a trailing --stream with no value', () => {
        expect(getLegacyStreamArgs(['--stream'])).toEqual([]);
    });
});
