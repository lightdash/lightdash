import {
    DimensionType,
    isField,
    shouldShiftItemTimezone,
    type Item,
} from '@lightdash/common';
import moment from 'moment';

// Shift raw to project TZ for TIMESTAMP-base time-interval DATE dims so drill
// filters target the displayed bucket. DATE-base dims and plain TIMESTAMPs are
// skipped — shifting would corrupt the calendar date / EQUALS comparison.
export const normalizeCellRawForFilter = (
    rawValue: unknown,
    field: Item | undefined,
    timezone: string | undefined,
): unknown => {
    if (rawValue === null || rawValue === undefined) return rawValue;
    if (typeof rawValue !== 'string') return rawValue;
    if (
        !isField(field) ||
        field.type !== DimensionType.DATE ||
        !shouldShiftItemTimezone(field)
    ) {
        return rawValue;
    }
    return moment
        .utc(rawValue)
        .tz(timezone || 'UTC')
        .format('YYYY-MM-DD');
};
