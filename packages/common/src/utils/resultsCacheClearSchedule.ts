import moment from 'moment-timezone';
import assertUnreachable from './assertUnreachable';

export type ResultsCacheClearCadence =
    | { frequency: 'daily'; hours: number[] }
    | { frequency: 'weekly'; dayOfWeek: number; hours: number[] };

const SUPPORTED_CRON = /^0 (\d{1,2}(?:,\d{1,2})*) \* \* (\*|[0-6])$/;

const toHourField = (hours: number[]): string =>
    [...hours].sort((a, b) => a - b).join(',');

export const resultsCacheClearCadenceToCron = (
    cadence: ResultsCacheClearCadence,
): string => {
    switch (cadence.frequency) {
        case 'daily':
            return `0 ${toHourField(cadence.hours)} * * *`;
        case 'weekly':
            return `0 ${toHourField(cadence.hours)} * * ${cadence.dayOfWeek}`;
        default:
            return assertUnreachable(cadence, 'Unknown cadence');
    }
};

/** Returns null for any cron the hourly sweep and the settings UI don't support. */
export const parseResultsCacheClearCron = (
    cron: string,
): ResultsCacheClearCadence | null => {
    const match = SUPPORTED_CRON.exec(cron);
    if (!match) return null;
    const [, hourField, dayField] = match;
    const hours = hourField.split(',').map(Number);
    const isCanonical =
        hours.every((hour) => hour <= 23) && toHourField(hours) === hourField;
    if (!isCanonical || new Set(hours).size !== hours.length) return null;
    return dayField === '*'
        ? { frequency: 'daily', hours }
        : { frequency: 'weekly', dayOfWeek: Number(dayField), hours };
};

const MS_PER_HOUR = 60 * 60 * 1000;

const roundUpToHour = (time: number): Date =>
    new Date(Math.ceil(time / MS_PER_HOUR) * MS_PER_HOUR);

/**
 * Rounds up to the top of a UTC hour, when the sweep runs, so half-hour offset
 * timezones report the real time. Times skipped by daylight saving move forward
 * and repeated times run once.
 */
export const getNextResultsCacheClearAt = (
    cron: string,
    timezone: string,
    after: Date,
): Date => {
    const cadence = parseResultsCacheClearCron(cron);
    if (cadence === null) {
        throw new Error(`Unsupported results cache clear cron: ${cron}`);
    }
    const localAfter = moment.tz(after, timezone);
    const days =
        cadence.frequency === 'daily'
            ? [localAfter, localAfter.clone().add(1, 'day')]
            : [
                  localAfter.clone().day(cadence.dayOfWeek),
                  localAfter.clone().day(cadence.dayOfWeek).add(1, 'week'),
              ];
    const next = days
        .flatMap((day) =>
            cadence.hours.map((hour) =>
                day.clone().hour(hour).minute(0).second(0).millisecond(0),
            ),
        )
        .find((candidate) => candidate.isAfter(localAfter));
    if (!next) {
        throw new Error(`No next results cache clear for cron: ${cron}`);
    }
    return roundUpToHour(next.valueOf());
};
