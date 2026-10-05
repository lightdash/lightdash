import { DateGranularity } from '@lightdash/common';
import { getGranularityLabel, getNewDateZoomControl } from './utils';

describe('getGranularityLabel', () => {
    it('returns the override for a standard grain when present', () => {
        expect(
            getGranularityLabel(DateGranularity.WEEK, {
                [DateGranularity.WEEK]: 'Week starting Monday',
            }),
        ).toBe('Week starting Monday');
    });

    it('returns the enum value for a standard grain with no override', () => {
        expect(getGranularityLabel(DateGranularity.WEEK, {})).toBe('Week');
    });

    it('still labels a custom granularity from the map', () => {
        expect(
            getGranularityLabel('fiscal_quarter', {
                fiscal_quarter: 'Fiscal Quarter',
            }),
        ).toBe('Fiscal Quarter');
    });
});

describe('getNewDateZoomControl', () => {
    it('starts on the default grain, else the first enabled one, else month', () => {
        const granularities = [DateGranularity.WEEK, DateGranularity.YEAR];
        expect(
            getNewDateZoomControl({
                defaultGranularity: DateGranularity.YEAR,
                granularities,
            }),
        ).toMatchObject({ name: 'Date zoom', granularity: 'Year' });
        expect(
            getNewDateZoomControl({
                defaultGranularity: undefined,
                granularities,
            }).granularity,
        ).toBe(DateGranularity.WEEK);
        expect(
            getNewDateZoomControl({
                defaultGranularity: undefined,
                granularities: [],
            }).granularity,
        ).toBe(DateGranularity.MONTH);
    });

    it('gives every new control its own id', () => {
        const args = { defaultGranularity: undefined, granularities: [] };
        expect(getNewDateZoomControl(args).uuid).not.toBe(
            getNewDateZoomControl(args).uuid,
        );
    });
});
