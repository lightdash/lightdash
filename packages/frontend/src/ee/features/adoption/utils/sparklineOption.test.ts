import { describe, expect, it } from 'vitest';
import { getSparklineOption } from './sparklineOption';

const points = (counts: number[]) =>
    counts.map((activeUsers, i) => ({
        weekStart: `2026-01-${String(5 + 7 * i).padStart(2, '0')}`,
        activeUsers,
    }));

const yAxis = (counts: number[]) =>
    getSparklineOption(points(counts)).yAxis as { min: number; max?: number };

describe('getSparklineOption', () => {
    it('gives an all-zero series a range so the flat baseline draws', () => {
        expect(yAxis([0, 0, 0])).toMatchObject({ min: 0, max: 1 });
    });
    it('leaves the range to the chart when there is activity', () => {
        expect(yAxis([0, 3, 1]).max).toBeUndefined();
    });
});
