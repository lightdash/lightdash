import cronstrue from 'cronstrue';

export function getHumanReadableCronExpression(cronExpression: string) {
    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
    });
    return value[0].toLowerCase() + value.slice(1);
}
