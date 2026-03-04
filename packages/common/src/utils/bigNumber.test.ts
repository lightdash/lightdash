import { DateGranularity } from '../types/timeFrames';
import { resolveGranularityInLabel } from './bigNumber';

describe('resolveGranularityInLabel', () => {
    it('replaces ${field.granularity} with lowercase granularity value', () => {
        expect(
            resolveGranularityInLabel(
                'compared to last ${events_date.granularity}',
                { events_date: DateGranularity.WEEK },
            ),
        ).toBe('compared to last week');
    });

    it('replaces multiple different field references', () => {
        expect(
            resolveGranularityInLabel(
                '${events_date.granularity} and ${orders_created.granularity}',
                {
                    events_date: DateGranularity.MONTH,
                    orders_created: DateGranularity.WEEK,
                },
            ),
        ).toBe('month and week');
    });

    it('replaces multiple occurrences of the same field', () => {
        expect(
            resolveGranularityInLabel(
                '${events_date.granularity} over ${events_date.granularity}',
                { events_date: DateGranularity.MONTH },
            ),
        ).toBe('month over month');
    });

    it('returns label unchanged when no placeholders present', () => {
        expect(
            resolveGranularityInLabel('static label', {
                events_date: DateGranularity.DAY,
            }),
        ).toBe('static label');
    });

    it('returns label unchanged when granularity map is empty', () => {
        expect(
            resolveGranularityInLabel(
                'compared to last ${events_date.granularity}',
                {},
            ),
        ).toBe('compared to last ${events_date.granularity}');
    });

    it('leaves unmatched placeholders as-is', () => {
        expect(
            resolveGranularityInLabel(
                '${events_date.granularity} vs ${unknown_field.granularity}',
                { events_date: DateGranularity.DAY },
            ),
        ).toBe('day vs ${unknown_field.granularity}');
    });

    it('returns undefined when label is undefined', () => {
        expect(
            resolveGranularityInLabel(undefined, {
                events_date: DateGranularity.WEEK,
            }),
        ).toBeUndefined();
    });

    it('works with all DateGranularity values', () => {
        const map = { d: DateGranularity.DAY };
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe('day');

        map.d = DateGranularity.WEEK;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe('week');

        map.d = DateGranularity.MONTH;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe(
            'month',
        );

        map.d = DateGranularity.QUARTER;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe(
            'quarter',
        );

        map.d = DateGranularity.YEAR;
        expect(resolveGranularityInLabel('${d.granularity}', map)).toBe('year');
    });
});
