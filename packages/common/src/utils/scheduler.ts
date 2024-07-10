import cronstrue from 'cronstrue';

export function getHumanReadableCronExpression(cronExpression: string) {
    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
    });
    const valueWithUTC = value
        .replaceAll(' PM', ' PM (UTC)')
        .replaceAll(' AM', ' AM (UTC)');

    return valueWithUTC[0].toLowerCase() + valueWithUTC.slice(1);
}

export function isAllowedCronExpression(cronExpression: string): boolean {
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
