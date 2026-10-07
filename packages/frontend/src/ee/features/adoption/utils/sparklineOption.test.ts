import { describe, expect, it } from 'vitest';
import { getSparklineOption, hasActivity } from './sparklineOption';

const points = (counts: number[]) =>
    counts.map((activeUsers, i) => ({
        weekStart: `2026-01-${String(5 + 7 * i).padStart(2, '0')}`,
        activeUsers,
    }));

describe('hasActivity', () => {
    it('is false for no points and for all zeros', () => {
        expect(hasActivity([])).toBe(false);
        expect(hasActivity(points([0, 0, 0]))).toBe(false);
    });
    it('is true when any week has activity', () => {
        expect(hasActivity(points([0, 3, 0]))).toBe(true);
    });
});

describe('getSparklineOption', () => {
    it('plots one value per week', () => {
        const option = getSparklineOption(points([1, 2, 3]));
        expect(option.series).toMatchObject([{ data: [1, 2, 3] }]);
    });
});
