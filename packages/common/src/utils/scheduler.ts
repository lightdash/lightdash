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
