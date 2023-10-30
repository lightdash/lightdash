import { stringToArray } from 'cron-converter';

export enum Frequency {
    HOURLY = 'HOURLY',
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
    CUSTOM = 'CUSTOM',
}
const hasAllHours = (count: number) => count === 24;
const hasAllDays = (count: number) => count === 31;
const hasAllMonths = (count: number) => count === 12;
const hasAllWeekDays = (count: number) => count === 7;

export const mapCronExpressionToFrequency = (value: string): Frequency => {
    try {
        const arr = stringToArray(value);
        const minutesCount = arr[0].length;
        const hoursCount = arr[1].length;
        const daysCount = arr[2].length;
        const monthsCount = arr[3].length;
        const weekDaysCount = arr[4].length;
        if (
            minutesCount === 1 &&
            hasAllHours(hoursCount) &&
            hasAllDays(daysCount) &&
            hasAllMonths(monthsCount) &&
            hasAllWeekDays(weekDaysCount)
        ) {
            return Frequency.HOURLY;
        } else if (
            minutesCount === 1 &&
            hoursCount === 1 &&
            hasAllDays(daysCount) &&
            hasAllMonths(monthsCount) &&
            hasAllWeekDays(weekDaysCount)
        ) {
            return Frequency.DAILY;
        } else if (
            minutesCount === 1 &&
            hoursCount === 1 &&
            hasAllDays(daysCount) &&
            hasAllMonths(monthsCount) &&
            weekDaysCount === 1
        ) {
            return Frequency.WEEKLY;
        } else if (
            minutesCount === 1 &&
            hoursCount === 1 &&
            daysCount === 1 &&
            hasAllMonths(monthsCount) &&
            hasAllWeekDays(weekDaysCount)
        ) {
            return Frequency.MONTHLY;
        } else {
            return Frequency.CUSTOM;
        }
    } catch {
        return Frequency.CUSTOM;
    }
};

type CronDetails = {
    minutes: number;
    hours: number;
    day: number;
    month: number;
    weekDay: number;
};
export const parseCronExpression = (value: string): CronDetails => {
    try {
        const arr = stringToArray(value);
        return {
            minutes: arr[0][0],
            hours: arr[1][0],
            day: arr[2][0],
            month: arr[3][0],
            weekDay: arr[4][0],
        };
    } catch (e) {
        return {
            minutes: 0,
            hours: 0,
            day: 1,
            month: 1,
            weekDay: 0,
        };
    }
};

export const getHourlyCronExpression = (minutes: number): string => {
    return [minutes, '*', '*', '*', '*'].join(' ');
};

export const getDailyCronExpression = (
    minutes: number,
    hours: number,
): string => {
    return [minutes, hours, '*', '*', '*'].join(' ');
};

export const getWeeklyCronExpression = (
    minutes: number,
    hours: number,
    weekDay: number,
): string => {
    return [minutes, hours, '*', '*', weekDay].join(' ');
};

export const getMonthlyCronExpression = (
    minutes: number,
    hours: number,
    day: number,
): string => {
    return [minutes, hours, day, '*', '*'].join(' ');
};

export const getFrequencyCronExpression = (
    frequency: Frequency,
    cronExpression: string,
): string => {
    const { minutes, hours, day, weekDay } =
        parseCronExpression(cronExpression);
    let newCronExpression: string;
    switch (frequency) {
        case Frequency.HOURLY: {
            newCronExpression = getHourlyCronExpression(minutes);
            break;
        }
        case Frequency.DAILY: {
            newCronExpression = getDailyCronExpression(minutes, hours);
            break;
        }
        case Frequency.WEEKLY: {
            newCronExpression = getWeeklyCronExpression(
                minutes,
                hours,
                weekDay,
            );
            break;
        }
        case Frequency.MONTHLY: {
            newCronExpression = getMonthlyCronExpression(minutes, hours, day);
            break;
        }
        case Frequency.CUSTOM: {
            newCronExpression = cronExpression;
            break;
        }
    }
    return newCronExpression;
};
