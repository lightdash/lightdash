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
        console.log('parseCronExpression', value, arr);
        return {
            minutes: arr[0][0],
            hours: arr[1][0],
            day: arr[2][0],
            month: arr[3][0],
            weekDay: arr[4][0],
        };
    } catch {
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
