import { describe, expect, it } from 'vitest';
import { getSweepDelay } from './sweepDelay';

const MAP = { width: 1200, height: 600 };

describe('getSweepDelay', () => {
    it('starts the sweep at the top-left corner', () => {
        expect(getSweepDelay({ x: 0, y: 0 }, MAP)).toBe(0);
    });
    it('reaches a dot 220 px across and 100 px down after 127 ms', () => {
        expect(getSweepDelay({ x: 220, y: 100 }, MAP)).toBe(127);
    });
    it('reaches the far corner of a 1,200 × 600 map after about 709 ms', () => {
        expect(getSweepDelay({ x: 1200, y: 600 }, MAP)).toBeCloseTo(709, 0);
    });
    it('gives a dot off the visible map the delay of the nearest point on it', () => {
        expect(getSweepDelay({ x: -40, y: -10 }, MAP)).toBe(0);
        expect(getSweepDelay({ x: 220, y: -50 }, MAP)).toBe(
            getSweepDelay({ x: 220, y: 0 }, MAP),
        );
        expect(getSweepDelay({ x: 5000, y: 900 }, MAP)).toBe(
            getSweepDelay({ x: 1200, y: 600 }, MAP),
        );
    });
});
