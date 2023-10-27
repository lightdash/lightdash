import { WeekDay } from '@lightdash/common';
import { DayOfWeek } from '@mantine/dates';

import dayjs from 'dayjs';
import getLocaleData from 'dayjs/plugin/localeData';
import updateLocale from 'dayjs/plugin/updateLocale';

dayjs.extend(getLocaleData);
dayjs.extend(updateLocale);

export const getDateValueFromUnknown = (value: unknown): Date | undefined => {
    if (!value) return;

    if (typeof value === 'string') {
        return dayjs(value).toDate();
    } else if (value instanceof Date) {
        return value;
    } else {
        throw new Error(`Invalid date value: ${value} (${typeof value})`);
    }
};

//
// internally we use WeekDay enum with values from 0 (Monday) to 6 (Sunday)
// normalized values are from 0 (Sunday) to 6 (Saturday)
//
export const normalizeWeekDay = (weekDay: WeekDay): DayOfWeek => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as DayOfWeek;
};

export const getFirstDayOfWeek = (startOfWeekDay?: WeekDay): DayOfWeek => {
    if (!startOfWeekDay) {
        return dayjs().localeData().firstDayOfWeek() as DayOfWeek;
    } else {
        return normalizeWeekDay(startOfWeekDay);
    }
};

export const startOfWeek = (date: Date, firstDayOfWeek: DayOfWeek) => {
    const currentLocale = dayjs.locale();
    const localeFirstDayOfWeek = dayjs().localeData().firstDayOfWeek();

    dayjs.updateLocale(currentLocale, {
        weekStart: firstDayOfWeek,
    });

    const startOfWeekDate = dayjs(date).startOf('week').toDate();

    dayjs.updateLocale(currentLocale, {
        weekStart: localeFirstDayOfWeek,
    });

    return startOfWeekDate;
};

export const endOfWeek = (date: Date, fdow: DayOfWeek) => {
    return dayjs(startOfWeek(date, fdow)).add(6, 'day').toDate();
};

export const isInWeekRange = (
    date: Date | undefined,
    selectedDate: Date | undefined,
    firstDayOfWeek: DayOfWeek,
) => {
    if (!selectedDate) return false;

    return (
        (dayjs(date).isSame(startOfWeek(selectedDate, firstDayOfWeek)) ||
            dayjs(date).isAfter(startOfWeek(selectedDate, firstDayOfWeek))) &&
        (dayjs(date).isBefore(endOfWeek(selectedDate, firstDayOfWeek)) ||
            dayjs(date).isSame(endOfWeek(selectedDate, firstDayOfWeek)))
    );
};
