import { describe, expect, it } from 'vitest';
import { getSparklineLabel } from './sparklineLabel';

const points = (counts: number[]) =>
    counts.map((activeUsers, i) => ({
        weekStart: `2026-01-${String(i + 1).padStart(2, '0')}`,
        activeUsers,
    }));

describe('getSparklineLabel', () => {
    it('states the start and current values', () => {
        expect(getSparklineLabel(points([3, 5, 6, 8]))).toBe(
            'Weekly active users over 4 weeks: 3 at the start, 8 now',
        );
    });
    it('says so when nobody was active', () => {
        expect(getSparklineLabel(points([0, 0, 0]))).toBe(
            'No activity in the last 3 weeks',
        );
    });
    it('handles a trend that started at zero', () => {
        expect(getSparklineLabel(points([0, 0, 2]))).toBe(
            'Weekly active users over 3 weeks: 0 at the start, 2 now',
        );
    });
    it('handles no data', () => {
        expect(getSparklineLabel([])).toBe('No weekly activity data');
    });
});
