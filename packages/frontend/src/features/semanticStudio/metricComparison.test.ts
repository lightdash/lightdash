import { describe, expect, it } from 'vitest';
import { describeShift } from './metricComparison';

describe('describeShift', () => {
    it('gives the change as a signed percentage', () => {
        expect(describeShift(63382, 61806)).toBe('-2.5%');
        expect(describeShift('100', '150')).toBe('+50%');
    });

    it('says nothing when the number did not move or cannot be compared', () => {
        expect(describeShift(5, 5)).toBeNull();
        expect(describeShift(0, 5)).toBeNull();
        expect(describeShift('a', 5)).toBeNull();
    });
});
