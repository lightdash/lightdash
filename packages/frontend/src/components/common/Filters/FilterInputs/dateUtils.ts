import { WeekDay } from '@lightdash/common';
import { DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';

//
// internally we use WeekDay enum with values from 0 (Monday) to 6 (Sunday)
// normalized values are from 0 (Sunday) to 6 (Saturday)
//
export const normalizeWeekDay = (weekDay: WeekDay): DayOfWeek => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as DayOfWeek;
};

export const startOfWeek = (date: Date, startOfWeekDay: WeekDay) => {
    return dayjs(date)
        .locale(dayjs.locale(), { weekStart: startOfWeekDay })
        .startOf('week')
        .toDate();
};

export const endOfWeek = (date: Date, startOfWeekDay: WeekDay) => {
    return dayjs(date)
        .locale(dayjs.locale(), { weekStart: startOfWeekDay })
        .endOf('week')
        .toDate();
};

export const isInWeekRange = (
    date: Date,
    value: Date | null,
    weekDay: WeekDay,
) => {
    if (!value) return false;
    const startOfWeekDate = startOfWeek(value, weekDay);
    const endOfWeekDate = endOfWeek(value, weekDay);

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
