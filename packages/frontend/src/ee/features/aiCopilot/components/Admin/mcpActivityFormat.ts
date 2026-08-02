// Browser-locale formatters (undefined locale) so date/time and decimal
// separators follow the user's settings, including 12/24h clocks.
const timeOnlyFormat = new Intl.DateTimeFormat(undefined, {
    timeStyle: 'medium',
});
const sameYearFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
});
const otherYearFormat = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
});
const fullFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
});
const millisecondsFormat = new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'millisecond',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
});
const secondsFormat = new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});

export const formatToolCallTime = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return timeOnlyFormat.format(date);
    }
    if (date.getFullYear() === now.getFullYear()) {
        return sameYearFormat.format(date);
    }
    return otherYearFormat.format(date);
};

export const formatToolCallTimeFull = (timestamp: string | Date): string =>
    fullFormat.format(new Date(timestamp));

export const formatToolCallDuration = (durationMs: number): string =>
    durationMs >= 1000
        ? secondsFormat.format(durationMs / 1000)
        : millisecondsFormat.format(durationMs);
