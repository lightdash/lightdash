import cronstrue from 'cronstrue';
import { getArrayValue } from './accessors';

export function getTzMinutesOffset(oldTz: string, newTz: string) {
    const date = new Date();
    const oldFormattedString = date.toLocaleString('en-US', {
        timeZone: oldTz,
    });
    const newFormattedString = date.toLocaleString('en-US', {
        timeZone: newTz,
    });
    const dateInOldZone = new Date(oldFormattedString);
    const dateInNewZone = new Date(newFormattedString);
    return Math.round(
        (dateInNewZone.getTime() - dateInOldZone.getTime()) / (1000 * 60),
    );
}

export function formatMinutesOffset(offsetMins: number) {
    const sign = offsetMins >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMins);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes).padStart(2, '0');
    return `${sign}${paddedHours}:${paddedMinutes}`;
}

export function getTimezoneLabel(timezone: string | undefined) {
    if (timezone === undefined) return undefined;

    const minsOffset = getTzMinutesOffset('UTC', timezone);
    const offsetString = formatMinutesOffset(minsOffset);
    const keyWithNoUnderscores = timezone.replaceAll('_', ' ');

    const labelText =
        timezone === 'UTC'
            ? keyWithNoUnderscores
            : `(UTC ${offsetString}) ${keyWithNoUnderscores}`;
    return labelText;
}

export function getHumanReadableCronExpression(
    cronExpression: string | undefined,
    timezone: string,
) {
    if (!cronExpression) return '';

    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
    });

    const minsOffset = getTzMinutesOffset('UTC', timezone);
    const offsetString = formatMinutesOffset(minsOffset);

    const valueWithTimezone = value
        .replaceAll(' PM', ` PM (UTC ${offsetString})`)
        .replaceAll(' AM', ` AM (UTC ${offsetString})`);

    return (
        getArrayValue(valueWithTimezone, 0).toLowerCase() +
        valueWithTimezone.slice(1)
    );
}

export type CronCadence = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

const isFixedCronField = (field: string): boolean => /^\d+$/.test(field.trim());

const isWildcardCronField = (field: string): boolean => field.trim() === '*';

/**
 * Names the repeat interval of a cron expression in a single word, for copy
 * like "here is your weekly report". Only expressions built from fixed values
 * and wildcards map to a word; lists, ranges and steps ("0 9 * * 1,4") have no
 * one-word description and return undefined so callers can omit the cadence.
 */
export function getCronCadence(
    cronExpression: string,
): CronCadence | undefined {
    const fields = cronExpression.trim().split(/\s+/);
    if (fields.length !== 5) return undefined;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = fields.map((field) =>
        field.trim(),
    );
    if (
        minute === undefined ||
        hour === undefined ||
        dayOfMonth === undefined ||
        month === undefined ||
        dayOfWeek === undefined
    ) {
        return undefined;
    }

    // Sub-hourly and irregular minute fields have no cadence word.
    if (!isFixedCronField(minute)) return undefined;

    if (
        isWildcardCronField(hour) &&
        isWildcardCronField(dayOfMonth) &&
        isWildcardCronField(month) &&
        isWildcardCronField(dayOfWeek)
    ) {
        return 'hourly';
    }

    if (!isFixedCronField(hour)) return undefined;

    const hasDayOfWeek = isFixedCronField(dayOfWeek);
    const hasDayOfMonth = isFixedCronField(dayOfMonth);
    const hasMonth = isFixedCronField(month);

    if (
        isWildcardCronField(dayOfMonth) &&
        isWildcardCronField(month) &&
        isWildcardCronField(dayOfWeek)
    ) {
        return 'daily';
    }
    if (hasDayOfWeek && isWildcardCronField(dayOfMonth) && !hasMonth) {
        return isWildcardCronField(month) ? 'weekly' : undefined;
    }
    if (hasDayOfMonth && isWildcardCronField(dayOfWeek)) {
        if (isWildcardCronField(month)) return 'monthly';
        if (hasMonth) return 'yearly';
    }

    return undefined;
}

export function isValidFrequency(cronExpression: string): boolean {
    /** This function will return False if:
     * - the cronExpression is not valid (not 5 parts separated by spaces)
     * - the cronExpression frequency is less than 1 hour
     */
    const cronParts = cronExpression.trim().split(' ');
    if (cronParts.length !== 5) {
        // Invalid cron expression
        return false;
    }
    const [minutePart] = cronParts;
    if (minutePart === undefined) {
        return false;
    }
    if (
        minutePart.includes('/') ||
        minutePart.includes(',') ||
        minutePart.includes('-')
    ) {
        // We don't care about the values in the intervals
        return false;
    }
    if (minutePart === '*') {
        // Every minute case
        return false;
    }

    return true;
}

export function isValidTimezone(timezone: string | undefined): boolean {
    if (timezone === undefined) return true;

    try {
        Intl.DateTimeFormat('en-US', { timeZone: timezone });
        return true;
    } catch (e) {
        return false;
    }
}
