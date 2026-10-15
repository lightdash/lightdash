import { describe, expect, it } from 'vitest';
import { parseNatsWorkerStreams } from './parseNatsWorkerStreams';

describe('parseNatsWorkerStreams', () => {
    const registered = ['warehouse' as const, 'pre-aggregate' as const];

    it('runs every registered stream when no --stream is given', () => {
        expect(parseNatsWorkerStreams([], registered)).toEqual({
            streams: registered,
            retiredStreams: [],
        });
    });

    it('runs the requested streams', () => {
        expect(
            parseNatsWorkerStreams(['--stream', 'warehouse'], registered),
        ).toEqual({ streams: ['warehouse'], retiredStreams: [] });
    });

    it('accepts the retired duckdb stream and runs no stream for it', () => {
        expect(
            parseNatsWorkerStreams(['--stream', 'duckdb'], registered),
        ).toEqual({ streams: [], retiredStreams: ['duckdb'] });
    });

    it('keeps the other requested streams next to the retired one', () => {
        expect(
            parseNatsWorkerStreams(
                ['--stream', 'duckdb', '--stream', 'pre-aggregate'],
                registered,
            ),
        ).toEqual({ streams: ['pre-aggregate'], retiredStreams: ['duckdb'] });
    });

    it('rejects an unknown stream', () => {
        expect(() =>
            parseNatsWorkerStreams(['--stream', 'nope'], registered),
        ).toThrow();
    });
});
