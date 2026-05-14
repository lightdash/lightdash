import moment from 'moment-timezone';
import { DimensionType, isField, type Item } from '../types/field';
import { shouldShiftItemTimezone } from './formatting';

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
    if (!timezone) return rawValue;
    return moment.utc(rawValue).tz(timezone).format('YYYY-MM-DD');
};
