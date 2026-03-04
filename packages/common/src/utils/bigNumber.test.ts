import { DateGranularity } from '../types/timeFrames';
import { resolveGranularityInLabel } from './bigNumber';

describe('resolveGranularityInLabel', () => {
    it('replaces ${granularity} with lowercase granularity value', () => {
        expect(
            resolveGranularityInLabel(
                'compared to last ${granularity}',
                DateGranularity.WEEK,
            ),
        ).toBe('compared to last week');
    });

    it('replaces multiple occurrences', () => {
        expect(
            resolveGranularityInLabel(
                '${granularity} over ${granularity}',
                DateGranularity.MONTH,
            ),
        ).toBe('month over month');
    });

    it('returns label unchanged when no ${granularity} placeholder', () => {
        expect(
            resolveGranularityInLabel('static label', DateGranularity.DAY),
        ).toBe('static label');
    });

    it('returns label unchanged when granularity is undefined', () => {
        expect(
            resolveGranularityInLabel(
                'compared to last ${granularity}',
                undefined,
            ),
        ).toBe('compared to last ${granularity}');
    });

    it('returns undefined when label is undefined', () => {
        expect(
            resolveGranularityInLabel(undefined, DateGranularity.WEEK),
        ).toBeUndefined();
    });

    it('works with all DateGranularity values', () => {
        expect(
            resolveGranularityInLabel(
                'per ${granularity}',
                DateGranularity.DAY,
            ),
        ).toBe('per day');
        expect(
            resolveGranularityInLabel(
                'per ${granularity}',
                DateGranularity.QUARTER,
            ),
        ).toBe('per quarter');
        expect(
            resolveGranularityInLabel(
                'per ${granularity}',
                DateGranularity.YEAR,
            ),
        ).toBe('per year');
    });
});
