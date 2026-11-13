import { describe, expect, it } from 'vitest';
import {
    formatDuration,
    formatElapsed,
    getWritebackStepIndex,
    initialStepTimes,
    recordStepTimes,
    stepDuration,
} from './writebackProgress';

describe('writeback progress', () => {
    it('maps run stages onto the steps a person sees', () => {
        expect(getWritebackStepIndex('pending')).toBe(0);
        expect(getWritebackStepIndex('clone')).toBe(1);
        expect(getWritebackStepIndex('agent')).toBe(2);
        expect(getWritebackStepIndex('push')).toBe(3);
        expect(getWritebackStepIndex('ready')).toBeNull();
        expect(getWritebackStepIndex('error')).toBeNull();
    });

    it('formats elapsed time as minutes and seconds', () => {
        expect(formatElapsed(0)).toBe('0:00');
        expect(formatElapsed(84_500)).toBe('1:24');
        expect(formatElapsed(-5)).toBe('0:00');
    });
});

describe('step times', () => {
    const start = '2026-11-13T10:00:00.000Z';
    const t0 = new Date(start).getTime();

    it('times steps it sees start, and the last one until the run ends', () => {
        let times = initialStepTimes(start);
        times = recordStepTimes(
            times,
            { step: 0, state: 'running' },
            t0 + 1000,
        );
        times = recordStepTimes(
            times,
            { step: 1, state: 'running' },
            t0 + 20_000,
        );
        times = recordStepTimes(
            times,
            { step: 2, state: 'running' },
            t0 + 32_000,
        );
        times = recordStepTimes(times, { step: 4, state: 'done' }, t0 + 90_000);
        expect(stepDuration(times, 0)).toBe(20_000);
        expect(stepDuration(times, 1)).toBe(12_000);
        expect(stepDuration(times, 2)).toBe(58_000);
        expect(stepDuration(times, 3)).toBeNull();
    });

    it('makes up no start for a step already under way at the first look', () => {
        let times = initialStepTimes(start);
        times = recordStepTimes(
            times,
            { step: 2, state: 'running' },
            t0 + 40_000,
        );
        times = recordStepTimes(
            times,
            { step: 3, state: 'running' },
            t0 + 70_000,
        );
        expect(stepDuration(times, 2)).toBeNull();
        expect(times.startedAt[3]).toBe(t0 + 70_000);
    });

    it('keeps the same object when nothing changed', () => {
        const times = recordStepTimes(
            initialStepTimes(start),
            { step: 1, state: 'running' },
            t0,
        );
        expect(
            recordStepTimes(times, { step: 1, state: 'running' }, t0 + 5),
        ).toBe(times);
    });

    it('formats short durations', () => {
        expect(formatDuration(1_700)).toBe('2s');
        expect(formatDuration(64_000)).toBe('1m 04s');
    });
});
