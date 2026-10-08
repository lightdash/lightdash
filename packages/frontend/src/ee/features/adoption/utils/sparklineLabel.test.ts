import { describe, expect, it } from 'vitest';
import { getSparklineLabel } from './sparklineLabel';

const points = (counts: number[]) =>
    counts.map((activeUsers, i) => ({
        weekStart: `2026-01-${String(i + 1).padStart(2, '0')}`,
        activeUsers,
    }));

describe('getSparklineLabel', () => {
    it('states the start and the week so far', () => {
        expect(getSparklineLabel(points([3, 5, 6, 8]))).toBe(
            'Weekly active users over 4 weeks: 3 at the start, 8 this week so far',
        );
    });
    it('groups thousands', () => {
        expect(getSparklineLabel(points([1200, 1500]))).toBe(
            'Weekly active users over 2 weeks: 1,200 at the start, 1,500 this week so far',
        );
    });
    it('says so when nobody was active', () => {
        expect(getSparklineLabel(points([0, 0, 0]))).toBe(
            'No activity in the last 3 weeks',
        );
    });
    it('handles a trend that started at zero', () => {
        expect(getSparklineLabel(points([0, 0, 2]))).toBe(
            'Weekly active users over 3 weeks: 0 at the start, 2 this week so far',
        );
    });
    it('says one week in the singular', () => {
        expect(getSparklineLabel(points([4]))).toBe(
            'Weekly active users over 1 week: 4 at the start, 4 this week so far',
        );
        expect(getSparklineLabel(points([0]))).toBe(
            'No activity in the last 1 week',
        );
    });
    it('handles no data', () => {
        expect(getSparklineLabel([])).toBe('No weekly activity data');
    });
});
