import { WeekDay } from '@lightdash/common';
import { DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';

//
// date inputs accepts start of the week day
// prop is firstDayOfWeek: number 0-6
// 0 – Sunday, 6 – Saturday, defaults to 1 – Monday
// our internal WeekDay enum is a range from 0 (Monday) to 6 (Sunday)
//
export const convertWeekDayToDayOfWeek = (weekDay: WeekDay): DayOfWeek => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as DayOfWeek;
};

export const startOfWeek = (date: Date, startOfWeekDay: WeekDay) => {
    return dayjs(date)
        .locale('custom', { weekStart: startOfWeekDay })
        .startOf('week')
        .toDate();
};

export const endOfWeek = (date: Date, weekDay: WeekDay) => {
    return dayjs(date)
        .locale('custom', { weekStart: weekDay })
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
