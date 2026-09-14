import { describe, expect, it } from 'vitest';
import { formatElapsedClock } from './formatElapsedClock';

describe('formatElapsedClock', () => {
    it('counts from zero rather than rounding up to a second', () => {
        // A duration reads "1s" at the start; a clock has to read 0:00 or it
        // looks like it has already been running.
        expect(formatElapsedClock(0)).toBe('0:00');
        expect(formatElapsedClock(400)).toBe('0:00');
    });

    it('pads seconds', () => {
        expect(formatElapsedClock(9_000)).toBe('0:09');
        expect(formatElapsedClock(12_000)).toBe('0:12');
    });

    it('rolls into minutes', () => {
        expect(formatElapsedClock(60_000)).toBe('1:00');
        expect(formatElapsedClock(95_000)).toBe('1:35');
        expect(formatElapsedClock(3_600_000)).toBe('60:00');
    });

    it('never goes backwards past zero', () => {
        expect(formatElapsedClock(-5_000)).toBe('0:00');
    });
});
