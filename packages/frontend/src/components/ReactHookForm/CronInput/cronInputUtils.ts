import { stringToArray } from 'cron-converter';
import { Frequency } from './FrequencySelect';

export const mapCronExpressionToFrequency = (value: string): Frequency => {
    try {
        const arr = stringToArray(value);
    } catch {}
    // TODO: implement
    return Frequency.CUSTOM;
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

export const getTimePickerValue = (hours: number, minutes: number) => {
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    return date;
};

export const getHourlyCronExpression = (minutes: number): string => {
    return [minutes, '*', '*', '*', '*'].join(' ');
};

export const getDailyCronExpression = (
    hours: number,
    minutes: number,
): string => {
    return [minutes, hours, '*', '*', '*'].join(' ');
};

export const getWeeklyCronExpression = (
    hours: number,
    minutes: number,
    weekDay: number,
): string => {
    return [minutes, hours, '*', '*', weekDay].join(' ');
};

export const getMonthlyCronExpression = (
    hours: number,
    minutes: number,
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
