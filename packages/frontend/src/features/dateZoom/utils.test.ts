import { DateGranularity } from '@lightdash/common';
import { getGranularityLabel } from './utils';

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
