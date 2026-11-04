import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

const WALL_CLOCK_FORMAT = 'YYYY-MM-DDTHH:mm:ss';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mantine renders Date objects in the browser's local TZ. To display
// project-TZ wall-clock, we shift the Date so its UTC instant matches the
// wall-clock when interpreted by the browser. unshiftFromProjectTimezone
// inverts the shift so the real UTC instant bubbles up to callers unchanged.
export const shiftToProjectTimezone = (
    value: Date,
    projectTimezone: string,
): Date => {
    const wallClock = dayjs(value)
        .tz(projectTimezone)
        .format(WALL_CLOCK_FORMAT);
    return dayjs(wallClock).toDate();
};

export const unshiftFromProjectTimezone = (
    date: Date,
    projectTimezone: string,
): Date => {
    const wallClock = dayjs(date).format(WALL_CLOCK_FORMAT);
    const parsed = dayjs.tz(wallClock, projectTimezone);
    // Day.js resolves a DST fold using today's offset, so pick the earlier instant explicitly.
    const offsetBefore = dayjs(parsed.valueOf() - MS_PER_DAY)
        .tz(projectTimezone)
        .utcOffset();
    const earlier = dayjs
        .utc(wallClock)
        .subtract(offsetBefore, 'minute')
        .tz(projectTimezone);
    return earlier.format(WALL_CLOCK_FORMAT) === wallClock
        ? earlier.toDate()
        : parsed.toDate();
};
