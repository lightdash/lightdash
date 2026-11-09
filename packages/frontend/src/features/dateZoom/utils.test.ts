import { DateGranularity } from '@lightdash/common';
import { DEFAULT_UI_STRINGS, type UiStringResolver } from '@lightdash/common';
import { getDateZoomSummaryLabel, getGranularityLabel } from './utils';

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

describe('getDateZoomSummaryLabel', () => {
    const getUiString = ((key: keyof typeof DEFAULT_UI_STRINGS) =>
        DEFAULT_UI_STRINGS[key]) as UiStringResolver;

    it('reads Default with no zoom, as shipped', () => {
        expect(getDateZoomSummaryLabel(undefined, getUiString)).toBe(
            DEFAULT_UI_STRINGS['filters.summary.default'],
        );
    });

    it('reads None with no zoom where the Default pill does', () => {
        expect(getDateZoomSummaryLabel(undefined, getUiString, true)).toBe(
            'None',
        );
    });

    it('names the zoom either way', () => {
        expect(
            getDateZoomSummaryLabel(DateGranularity.WEEK, getUiString, true),
        ).toBe('Week');
    });
});
