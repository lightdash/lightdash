import cronstrue from 'cronstrue';

export function getHumanReadableCronExpression(
    cronExpression: string,
    timezone: string,
) {
    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
    });
    const valueWithUTC = value
        .replaceAll(' PM', ` PM (${timezone})`)
        .replaceAll(' AM', ` AM (${timezone})`);

    return valueWithUTC[0].toLowerCase() + valueWithUTC.slice(1);
}
