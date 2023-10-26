import { WeekDay } from '@lightdash/common';
import { DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

//
// internally we use WeekDay enum with values from 0 (Monday) to 6 (Sunday)
// normalized values are from 0 (Sunday) to 6 (Saturday)
//
export const normalizeWeekDay = (weekDay: WeekDay): DayOfWeek => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as DayOfWeek;
};

export function startOfWeek(date: Date, dayOfWeek?: DayOfWeek): Date {
    if (typeof dayOfWeek !== 'undefined' && dayOfWeek !== null) {
        const valueWeekDay = dayjs(date).isoWeekday();

        if (valueWeekDay > dayOfWeek) {
            return dayjs(date)
                .subtract(valueWeekDay - dayOfWeek, 'day')
                .toDate();
        } else if (dayOfWeek > valueWeekDay) {
            return dayjs(date)
                .subtract(7 - dayOfWeek + valueWeekDay, 'day')
                .toDate();
        } else {
            return dayjs(date).toDate();
        }
    }
    return dayjs(date).startOf('week').toDate();
}

export function endOfWeek(date: Date, dayOfWeek?: DayOfWeek): Date {
    const startDate = startOfWeek(date, dayOfWeek);
    return dayjs(startDate).add(6, 'day').toDate();
}

export const isInWeekRange = (
    date: Date,
    value: Date | null,
    dayOfWeek?: DayOfWeek,
) => {
    if (!value) return false;

    const startOfWeekDate = startOfWeek(value, dayOfWeek);
    const endOfWeekDate = endOfWeek(value, dayOfWeek);

    return (
        (dayjs(date).isSame(startOfWeekDate) ||
            dayjs(date).isAfter(startOfWeekDate)) &&
        (dayjs(date).isSame(endOfWeekDate) ||
            dayjs(date).isBefore(endOfWeekDate))
    );
};

export const getDateValueFromUnknown = (value: unknown): Date | null => {
    if (!value) return null;

    if (typeof value === 'string') {
        return new Date(value);
    } else if (value instanceof Date) {
        return value;
    } else {
        throw new Error(`Invalid date value: ${value} (${typeof value})`);
    }
};
