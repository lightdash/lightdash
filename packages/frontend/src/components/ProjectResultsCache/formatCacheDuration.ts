const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? '' : 's'}`;

export const formatCacheDuration = (seconds: number): string => {
    if (seconds >= 2 * DAY && seconds % DAY === 0)
        return plural(seconds / DAY, 'day');
    if (seconds >= HOUR)
        return plural(Number((seconds / HOUR).toFixed(1)), 'hour');
    return plural(Math.round(seconds / MINUTE), 'minute');
};
