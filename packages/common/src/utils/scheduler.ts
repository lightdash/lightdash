import cronstrue from 'cronstrue';

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
    cronExpression: string,
    timezone: string,
) {
    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
    });

    const minsOffset = getTzMinutesOffset('UTC', timezone);
    const offsetString = formatMinutesOffset(minsOffset);

    const valueWithTimezone = value
        .replaceAll(' PM', ` PM (UTC ${offsetString})`)
        .replaceAll(' AM', ` AM (UTC ${offsetString})`);

    return valueWithTimezone[0].toLowerCase() + valueWithTimezone.slice(1);
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
