import {
    exceedsRetentionCeiling,
    getEffectiveRetentionWindowHours,
    isValidRetentionWindowHours,
    MAX_RETENTION_WINDOW_HOURS,
} from './dataRetention';

describe('isValidRetentionWindowHours', () => {
    it('accepts null (keep forever)', () => {
        expect(isValidRetentionWindowHours(null)).toBe(true);
    });

    it('accepts whole hours of at least 1', () => {
        expect(isValidRetentionWindowHours(1)).toBe(true);
        expect(isValidRetentionWindowHours(720)).toBe(true);
    });

    it('rejects zero, negatives, and fractions', () => {
        expect(isValidRetentionWindowHours(0)).toBe(false);
        expect(isValidRetentionWindowHours(-24)).toBe(false);
        expect(isValidRetentionWindowHours(1.5)).toBe(false);
    });

    it('accepts up to 100 years and rejects absurd magnitudes', () => {
        expect(isValidRetentionWindowHours(MAX_RETENTION_WINDOW_HOURS)).toBe(
            true,
        );
        expect(
            isValidRetentionWindowHours(MAX_RETENTION_WINDOW_HOURS + 1),
        ).toBe(false);
        expect(isValidRetentionWindowHours(2 ** 31)).toBe(false);
        expect(isValidRetentionWindowHours(Number.MAX_SAFE_INTEGER)).toBe(
            false,
        );
        expect(isValidRetentionWindowHours(Infinity)).toBe(false);
        expect(isValidRetentionWindowHours(NaN)).toBe(false);
    });
});

describe('getEffectiveRetentionWindowHours', () => {
    it('returns null when neither side sets a window', () => {
        expect(getEffectiveRetentionWindowHours(null, null)).toBeNull();
    });

    it('inherits the ceiling when the override is unset', () => {
        expect(getEffectiveRetentionWindowHours(null, 720)).toBe(720);
    });

    it('uses the override when there is no ceiling', () => {
        expect(getEffectiveRetentionWindowHours(24, null)).toBe(24);
    });

    it('applies the smaller window when both are set', () => {
        expect(getEffectiveRetentionWindowHours(1, 720)).toBe(1);
        expect(getEffectiveRetentionWindowHours(720, 24)).toBe(24);
    });
});

describe('exceedsRetentionCeiling', () => {
    it('never exceeds when there is no ceiling', () => {
        expect(exceedsRetentionCeiling(9999, null)).toBe(false);
        expect(exceedsRetentionCeiling(null, null)).toBe(false);
    });

    it('inheriting (null override) never exceeds the ceiling', () => {
        expect(exceedsRetentionCeiling(null, 24)).toBe(false);
    });

    it('tightening below or matching the ceiling is allowed', () => {
        expect(exceedsRetentionCeiling(1, 24)).toBe(false);
        expect(exceedsRetentionCeiling(24, 24)).toBe(false);
    });

    it('extending beyond the ceiling exceeds it', () => {
        expect(exceedsRetentionCeiling(25, 24)).toBe(true);
    });
});
