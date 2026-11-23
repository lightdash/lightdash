const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const timeOf = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * When a limit resets, as of when usage was read: seconds or minutes when it
 * is close, a time later today, and a date beyond that.
 */
export const formatResetsAt = (resetsAt: string, checkedAt: string): string => {
    const resets = new Date(resetsAt);
    const checked = new Date(checkedAt);
    const inMs = Math.max(0, resets.getTime() - checked.getTime());
    if (inMs < MINUTE) return `resets in ${Math.ceil(inMs / SECOND)}s`;
    if (inMs < HOUR) return `resets in ${Math.ceil(inMs / MINUTE)} min`;
    if (resets.toDateString() === checked.toDateString()) {
        return `resets at ${timeOf(resets)}`;
    }
    const day = resets.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
    });
    return `resets ${day}, ${timeOf(resets)}`;
};

/** A vendor's pause, such as "until 14:05" or "until 24 Nov, 09:00". */
export const formatUntil = (until: string, checkedAt: string): string => {
    const date = new Date(until);
    if (date.toDateString() === new Date(checkedAt).toDateString()) {
        return `until ${timeOf(date)}`;
    }
    const day = date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
    });
    return `until ${day}, ${timeOf(date)}`;
};

/** Even spacing between calls, such as "4 calls a second" or "1 call every 2 seconds". */
export const formatPacing = (callsPerSecond: number): string => {
    if (callsPerSecond >= 1) {
        const calls = Number(callsPerSecond.toFixed(1));
        return `${calls.toLocaleString()} ${calls === 1 ? 'call' : 'calls'} a second`;
    }
    return `1 call every ${Math.round(1 / callsPerSecond)} seconds`;
};

/** Used of capacity, such as "410 of 10,000". */
export const formatUsed = (used: number, capacity: number): string =>
    `${used.toLocaleString()} of ${capacity.toLocaleString()}`;
