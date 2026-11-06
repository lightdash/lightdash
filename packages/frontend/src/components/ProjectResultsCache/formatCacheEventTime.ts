const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (date: Date, timeZone: string): string =>
    new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone,
    }).format(date);

const formatDay = (date: Date, timeZone: string, now: Date): string => {
    const key = dayKey(date, timeZone);
    if (key === dayKey(now, timeZone)) return 'Today';
    if (key === dayKey(new Date(now.getTime() + DAY_MS), timeZone)) {
        return 'Tomorrow';
    }
    if (key === dayKey(new Date(now.getTime() - DAY_MS), timeZone)) {
        return 'Yesterday';
    }
    const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: sameYear ? undefined : 'numeric',
        timeZone,
    })
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => part.value)
        .join(' ');
};

export const formatCacheEventTime = (
    value: Date,
    timeZone: string,
    now: Date = new Date(),
): string => {
    const date = new Date(value);
    const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'short',
        timeZone,
    }).format(date);
    return `${formatDay(date, timeZone, now)} at ${time}`;
};
