import { assertUnreachable, formatDate, TimeFrames } from '@lightdash/common';
import { type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { startOfWeek } from '../utils/filterDateUtils';
import { parseFilterDateValue } from './DateFilterInputs.utils';

dayjs.extend(quarterOfYear);

/** Calendar grains that can hold a list of discrete values. */
export type MultiDateTimeFrame =
    | TimeFrames.DAY
    | TimeFrames.WEEK
    | TimeFrames.MONTH
    | TimeFrames.QUARTER
    | TimeFrames.YEAR;

/** Grains with a dedicated picker of their own, i.e. anything but day. */
export type CoarseDateTimeFrame = Exclude<MultiDateTimeFrame, TimeFrames.DAY>;

/**
 * Resolves a dimension's time interval to its calendar grain. Returns null for
 * intervals without a calendar picker (raw, hour, minute, ...).
 */
export const getCoarseDateTimeFrame = (
    timeInterval: TimeFrames,
): CoarseDateTimeFrame | null => {
    switch (timeInterval.toUpperCase()) {
        case TimeFrames.WEEK:
            return TimeFrames.WEEK;
        case TimeFrames.MONTH:
            return TimeFrames.MONTH;
        case TimeFrames.QUARTER:
            return TimeFrames.QUARTER;
        case TimeFrames.YEAR:
            return TimeFrames.YEAR;
        default:
            return null;
    }
};

/**
 * Format the rule values are stored in. Quarters are stored as the first day of
 * the quarter rather than `YYYY-[Q]Q`, matching the single-value picker.
 */
export const getStoredValueTimeFrame = (
    timeFrame: MultiDateTimeFrame,
): TimeFrames =>
    timeFrame === TimeFrames.QUARTER ? TimeFrames.DAY : timeFrame;

export const startOfTimeFrame = (
    date: Date,
    timeFrame: MultiDateTimeFrame,
    firstDayOfWeek: DayOfWeek,
): Date => {
    switch (timeFrame) {
        case TimeFrames.DAY:
            return dayjs(date).startOf('day').toDate();
        case TimeFrames.WEEK:
            return startOfWeek(date, firstDayOfWeek);
        case TimeFrames.MONTH:
            return dayjs(date).startOf('month').toDate();
        case TimeFrames.QUARTER:
            return dayjs(date).startOf('quarter').toDate();
        case TimeFrames.YEAR:
            return dayjs(date).startOf('year').toDate();
        default:
            return assertUnreachable(timeFrame, 'Unknown date filter grain');
    }
};

/** Long, region-unambiguous labels for the selected values. */
export const formatTimeFrameLabel = (
    date: Date,
    timeFrame: MultiDateTimeFrame,
): string => {
    switch (timeFrame) {
        case TimeFrames.DAY:
        case TimeFrames.WEEK:
            return dayjs(date).format('MMMM D, YYYY');
        case TimeFrames.MONTH:
            return dayjs(date).format('MMMM YYYY');
        case TimeFrames.QUARTER:
            return formatDate(date, TimeFrames.QUARTER);
        case TimeFrames.YEAR:
            return dayjs(date).format('YYYY');
        default:
            return assertUnreachable(timeFrame, 'Unknown date filter grain');
    }
};

/** Snaps every value to the start of its period, then dedupes and sorts. */
export const normalizeTimeFrameValues = (
    dates: Date[],
    timeFrame: MultiDateTimeFrame,
    firstDayOfWeek: DayOfWeek,
): Date[] => {
    const starts = dates.map((date) =>
        startOfTimeFrame(date, timeFrame, firstDayOfWeek),
    );
    const byTime = new Map(starts.map((date) => [date.getTime(), date]));
    return [...byTime.values()].sort((a, b) => a.getTime() - b.getTime());
};

export const toggleTimeFrameValue = (
    dates: Date[],
    date: Date,
    timeFrame: MultiDateTimeFrame,
    firstDayOfWeek: DayOfWeek,
): Date[] => {
    const start = startOfTimeFrame(date, timeFrame, firstDayOfWeek);
    const isSelected = dates.some(
        (value) =>
            startOfTimeFrame(value, timeFrame, firstDayOfWeek).getTime() ===
            start.getTime(),
    );

    return isSelected
        ? dates.filter(
              (value) =>
                  startOfTimeFrame(
                      value,
                      timeFrame,
                      firstDayOfWeek,
                  ).getTime() !== start.getTime(),
          )
        : [...dates, start];
};

export const parseTypedTimeFrameValue = (
    input: string,
    timeFrame: MultiDateTimeFrame,
): Date | null =>
    parseFilterDateValue(input, getStoredValueTimeFrame(timeFrame));
