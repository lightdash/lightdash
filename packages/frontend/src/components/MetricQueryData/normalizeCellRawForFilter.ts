import {
    DimensionType,
    findFieldByIdInExplore,
    isDimension,
    type Explore,
} from '@lightdash/common';
import moment from 'moment';

// Shift the raw cell value into the project TZ for TIMESTAMP-base time-interval
// DATE dims so drill/underlying-data filters target the project-TZ bucket the
// user saw (e.g. Paris "Nov" is stored as 2024-10-31T23:00:00Z and would
// otherwise resolve to October). DATE-base time intervals are pure calendar
// values and must not be shifted — that would push e.g. Mar 1 to Feb 28 on
// negative offsets.
export const normalizeCellRawForFilter = (
    rawValue: unknown,
    fieldId: string,
    explore: Explore | undefined,
    timezone: string | undefined,
): unknown => {
    if (rawValue === null || rawValue === undefined || !explore)
        return rawValue;
    if (typeof rawValue !== 'string') return rawValue;
    const field = findFieldByIdInExplore(explore, fieldId);
    if (
        !field ||
        !isDimension(field) ||
        field.type !== DimensionType.DATE ||
        !field.timeInterval ||
        field.timeIntervalBaseDimensionType !== DimensionType.TIMESTAMP
    ) {
        return rawValue;
    }
    return moment
        .utc(rawValue)
        .tz(timezone || 'UTC')
        .format('YYYY-MM-DD');
};
